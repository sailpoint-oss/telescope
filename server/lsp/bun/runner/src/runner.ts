import { connect } from "net";
import type {
	Envelope,
} from "./types";
import { createRunnerState, handleMessage } from "./runner-core";

const socketPath = process.env.TELESCOPE_SOCKET;
if (!socketPath) {
	console.error("TELESCOPE_SOCKET not set");
	process.exit(1);
}

const state = createRunnerState(process.cwd());

const socket = connect(socketPath);
let buffer = "";

function send(envelope: Envelope): void {
	socket.write(JSON.stringify(envelope) + "\n");
}

socket.on("connect", () => {
	send({ id: "init", type: "ready" });
});

socket.on("data", (data) => {
	buffer += data.toString();
	const lines = buffer.split("\n");
	buffer = lines.pop() ?? "";

	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			const envelope = JSON.parse(line) as Envelope;
			handleMessage(envelope, state, {
				send,
				end: () => socket.end(),
				requestExit: (code) => process.exit(code),
			}).catch((err) => {
				console.error("Error handling message:", err);
			});
		} catch {
			console.error("Failed to parse message:", line);
		}
	}
});

socket.on("error", (err) => {
	console.error("Socket error:", err);
	process.exit(1);
});

socket.on("close", () => {
	process.exit(0);
});

