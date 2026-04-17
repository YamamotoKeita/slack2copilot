type CopilotStreamEvent = {
	type?: string;
	data?: {
		content?: string;
		deltaContent?: string;
		toolName?: string;
		arguments?: Record<string, unknown>;
		result?: {
			content?: string;
		};
	};
};

const STREAM_POST_INTERVAL_MS = 2_000;
const POST_TOOL_CALLS = false;

export async function askCopilot(
	prompt: string,
	onStreamChunk: (chunk: string) => Promise<void>,
): Promise<void> {
	const process = new Deno.Command("copilot", {
		args: [
			"-p",
			prompt,
			"--continue",
			"--autopilot",
			"--max-autopilot-continues=500",
			"--silent",
			"--allow-all",
			"--output-format",
			"json",
		],
		cwd: Deno.cwd(),
		stdout: "piped",
		stderr: "piped",
	}).spawn();

	const stderrPromise = readAllText(process.stderr);
	const decoder = new TextDecoder();
	let stdoutBuffer = "";
	let pendingChunk = "";
	let lastPostedAt = 0;
	let streamState = { pendingChunk, lastPostedAt };

	for await (const chunk of process.stdout) {
		stdoutBuffer += decoder.decode(chunk, { stream: true });
		const lines = stdoutBuffer.split("\n");
		stdoutBuffer = lines.pop() ?? "";

		for (const line of lines) {
			streamState = await processEventLine(line, onStreamChunk, streamState);
		}
	}

	stdoutBuffer += decoder.decode();
	if (stdoutBuffer.trim()) {
		streamState = await processEventLine(stdoutBuffer, onStreamChunk, streamState);
	}

	pendingChunk = streamState.pendingChunk;

	if (pendingChunk.trim()) {
		await onStreamChunk(pendingChunk.trimEnd());
	}

	const [{ code }, stderrText] = await Promise.all([process.status, stderrPromise]);
	if (code !== 0) {
		throw new Error(stderrText || `copilot exited with code ${code}`);
	}
}

function parseEvent(line: string): CopilotStreamEvent | null {
	if (!line.trim()) {
		return null;
	}

	try {
		return JSON.parse(line) as CopilotStreamEvent;
	} catch {
		return null;
	}
}

async function flushCompletedLines(
	onStreamChunk: (chunk: string) => Promise<void>,
	pendingChunk: string,
	lastPostedAt: number,
): Promise<{ pendingChunk: string; lastPostedAt: number }> {
	if (!pendingChunk.includes("\n")) {
		return { pendingChunk, lastPostedAt };
	}

	if (Date.now() - lastPostedAt < STREAM_POST_INTERVAL_MS) {
		return { pendingChunk, lastPostedAt };
	}

	const lastNewlineIndex = pendingChunk.lastIndexOf("\n");
	if (lastNewlineIndex < 0) {
		return { pendingChunk, lastPostedAt };
	}

	const chunkToPost = pendingChunk.slice(0, lastNewlineIndex).trimEnd();
	const remainingChunk = pendingChunk.slice(lastNewlineIndex + 1);
	if (!chunkToPost.trim()) {
		return { pendingChunk: remainingChunk, lastPostedAt };
	}

	await onStreamChunk(chunkToPost);
	return {
		pendingChunk: remainingChunk,
		lastPostedAt: Date.now(),
	};
}

async function processEventLine(
	line: string,
	onStreamChunk: (chunk: string) => Promise<void>,
	state: { pendingChunk: string; lastPostedAt: number },
): Promise<{ pendingChunk: string; lastPostedAt: number }> {
	const event = parseEvent(line);
	if (!event) {
		return state;
	}

	return await processEvent(event, onStreamChunk, state);
}

async function processEvent(
	event: CopilotStreamEvent,
	onStreamChunk: (chunk: string) => Promise<void>,
	state: { pendingChunk: string; lastPostedAt: number },
): Promise<{ pendingChunk: string; lastPostedAt: number }> {
	const chunk = formatEventChunk(event);
	if (!chunk) {
		return state;
	}

	const nextPendingChunk = state.pendingChunk + chunk;
	return await flushCompletedLines(
		onStreamChunk,
		nextPendingChunk,
		state.lastPostedAt,
	);
}

function formatEventChunk(event: CopilotStreamEvent): string {
	if (event.type === "assistant.message_delta") {
		return event.data?.deltaContent ?? "";
	}

	if (event.type !== "tool.execution_start") {
		return "";
	}

	const toolLog = formatToolExecutionStart(event);
	console.log(toolLog);
	if (!shouldPostToolCall(event)) {
		return "";
	}

	return `${ensureTrailingNewline(toolLog)}`;
}

function formatToolExecutionStart(event: CopilotStreamEvent): string {
	const toolName = event.data?.toolName || "unknown";
	const args = JSON.stringify(event.data?.arguments ?? {});
	return `[Tool] ${toolName}: ${args}`;
}

function shouldPostToolCall(event: CopilotStreamEvent): boolean {
	if (!POST_TOOL_CALLS) {
		return false;
	}

	return event.data?.toolName !== "task_complete";
}

function ensureTrailingNewline(text: string): string {
	if (!text) {
		return text;
	}

	if (text.endsWith("\n")) {
		return text;
	}

	return `${text}\n`;
}

async function readAllText(
	stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
	if (!stream) {
		return "";
	}

	const decoder = new TextDecoder();
	let text = "";
	for await (const chunk of stream) {
		text += decoder.decode(chunk, { stream: true });
	}

	return text + decoder.decode();
}