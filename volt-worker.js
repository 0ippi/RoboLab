// Ilmaisen Voltin kielimalli ajetaan tässä taustasäikeessä (WebLLM), jotta sovellus ei jäädy vastauksen ajaksi.
// Versio pidetään samana kuin assistant.js:n WEBLLM_URL.
import { WebWorkerMLCEngineHandler } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.82/+esm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
