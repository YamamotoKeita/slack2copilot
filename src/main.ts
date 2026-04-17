import { App } from "@slack/bolt";
import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { askCopilot } from "./copilot-cli.ts";

type Say = (message: string) => Promise<unknown>;

const app = new App({
	token: Deno.env.get("SLACK_OAUTH_TOKEN")!,
	appToken: Deno.env.get("SLACK_APP_TOKEN")!,
	socketMode: true,
});

app.message(async (
	{ message, say }: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">,
) => {
	// 特定のチャンネルに限定する場合は、以下のコメントを外してChannel IDを指定する
	// if (!("channel" in message) || message.channel !== "YOUR_CHANNEL_ID") return;

	// Botのメッセージを無視する
	if ("bot_id" in message) return;
	if (!("channel" in message) || !("ts" in message)) return;
	if (!("text" in message) || !message.text) return;

	// メンション先ユーザーなどを判定するには、さらに message のパースが必要だがこのサンプルではやらない

	const text = message.text;
	console.log(`Received message: ${text}`);

	try {
		await askCopilot(text, async (chunk) => {
			await postChunk(say, chunk);
		});
	} catch (error) {
		console.error(`Failed to get Copilot response: ${formatError(error)}`);
		return;
	}
});

await app.start();
console.log("slack2copilot is running");

async function postChunk(say: Say, chunk: string): Promise<void> {
	if (!chunk.trim()) return;

	try {
		await say(chunk);
	} catch (error) {
		console.error("Failed to send Slack response", {
			text: chunk,
			error: formatError(error),
		});
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
