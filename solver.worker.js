import { generateRandomLevel, solveCustomLevel } from "./solver.js";

self.addEventListener("message", (event) => {
    const { requestId, action, payload } = event.data;
    const result = action === "generate"
        ? generateRandomLevel(payload.seed)
        : solveCustomLevel(payload.placements);
    self.postMessage({ requestId, result });
});