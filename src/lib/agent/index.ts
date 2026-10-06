import { runOpenAI } from "./openai";
import { runScripted } from "./scripted";
import { TourSession, type Emit } from "./session";
import type { TourRequest } from "../types";

export const llmIsLive = () => Boolean(process.env.OPENAI_API_KEY);

/** Plans a tour, streaming progress through `emit`. Always ends with `done` or `error`. */
export async function runAgent(request: TourRequest, emit: Emit) {
  const session = new TourSession(request, emit, llmIsLive() ? "openai" : "scripted");
  emit({ type: "mode", mode: session.mode });
  try {
    await (llmIsLive() ? runOpenAI(session) : runScripted(session));
    emit({ type: "done" });
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
