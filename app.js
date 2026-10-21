import { PIECES } from "./solver.js";

const boardElement = document.querySelector("#board");
const worker = new Worker(new URL("./solver.worker.js", import.meta.url), { type: "module" });
const requests = new Map();
let nextRequestId = 0;
let mode = "random";
let generatedLevel = null;
let customPlacements = [];
let selectedPieceId = null;
let vertical = false;
const solutions = { random: null, custom: null };
let isRevealed = false;
let busy = false;
let checkState = { random: null, custom: null };

worker.addEventListener("message", ({ data }) => {
    const pending = requests.get(data.requestId);
    if (!pending) return;
    requests.delete(data.requestId);
    pending.resolve(data.result);
});

function askWorker(action, payload) {
    const requestId = ++nextRequestId;
    return new Promise((resolve) => {
        requests.set(requestId, { resolve });
        worker.postMessage({ requestId, action, payload });
    });
}

function setupPiece(id) {
    return PIECES.find((piece) => piece.id === id);
}

function getActivePlacements() {
    if (isRevealed && solutions[mode]) return solutions[mode];
    return mode === "random" ? generatedLevel?.blackPlacements ?? [] : customPlacements;
}

function renderBoard() {
    const occupied = new Map();
    for (const placement of getActivePlacements()) {
        const piece = setupPiece(placement.id) ?? PIECES.find((item) => item.id === placement.id);
        for (let row = placement.row; row < placement.row + placement.height; row += 1) {
            for (let col = placement.col; col < placement.col + placement.width; col += 1) {
                occupied.set(row * 8 + col, { piece, placement });
            }
        }
    }

    boardElement.replaceChildren();
    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const index = row * 8 + col;
            const cell = document.createElement("button");
            const entry = occupied.get(index);
            cell.type = "button";
            cell.className = "board-cell";
            cell.setAttribute("role", "gridcell");
            cell.setAttribute("aria-label", entry
                ? `Row ${row + 1}, column ${String.fromCharCode(65 + col)}, ${entry.piece.name}`
                : `Row ${row + 1}, column ${String.fromCharCode(65 + col)}, empty`);

            if (entry) {
                cell.classList.add(`cell-${entry.piece.color}`);
                if (entry.piece.color === "black") cell.classList.add("cell-fixed");
                if (entry.piece.color !== "black") cell.classList.add("cell-solution");
                cell.title = `${entry.piece.name} · click to ${entry.piece.color === "black" && mode === "custom" && !isRevealed ? "remove" : "view"}`;
            } else {
                cell.classList.add("cell-empty");
            }

            if (!isRevealed && mode === "custom") {
                cell.addEventListener("click", () => handleCustomCell(row, col, entry));
            }
            boardElement.append(cell);
        }
    }

    renderInventory();
}

function renderPieceShape(piece, orientation = false) {
    const shape = document.createElement("span");
    shape.className = `mini-piece mini-${piece.color}`;
    const height = orientation && piece.height !== piece.width ? piece.width : piece.height;
    const width = orientation && piece.height !== piece.width ? piece.height : piece.width;
    shape.style.setProperty("--mini-rows", height);
    shape.style.setProperty("--mini-cols", width);
    for (let index = 0; index < height * width; index += 1) {
        const tile = document.createElement("i");
        shape.append(tile);
    }
    return shape;
}

function renderInventory() {
    const randomInventory = document.querySelector("#random-inventory");
    randomInventory.replaceChildren();
    const randomPlaced = generatedLevel?.blackPlacements ?? [];
    for (const piece of PIECES.filter((item) => item.setup)) {
        const item = document.createElement("div");
        item.className = "inventory-piece";
        item.append(renderPieceShape(piece));
        const label = document.createElement("span");
        label.textContent = `${piece.height} × ${piece.width}`;
        item.append(label);
        if (randomPlaced.some((placement) => placement.id === piece.id)) item.classList.add("is-placed");
        randomInventory.append(item);
    }

    const customInventory = document.querySelector("#custom-inventory");
    customInventory.replaceChildren();
    for (const piece of PIECES.filter((item) => item.setup)) {
        const placed = customPlacements.some((placement) => placement.id === piece.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `inventory-piece rack-piece${selectedPieceId === piece.id ? " is-selected" : ""}${placed ? " is-placed" : ""}`;
        button.disabled = placed;
        button.setAttribute("aria-pressed", String(selectedPieceId === piece.id));
        button.setAttribute("aria-label", `${piece.name}${placed ? ", placed" : ", select to place"}`);
        button.append(renderPieceShape(piece, vertical));
        const label = document.createElement("span");
        label.textContent = `${piece.height} × ${piece.width}`;
        button.append(label);
        button.addEventListener("click", () => {
            selectedPieceId = piece.id;
            vertical = false;
            resetCheck("custom");
            renderBoard();
            updateCustomControls();
        });
        customInventory.append(button);
    }
}

function updateResult(container, state) {
    const indicator = container.querySelector(".result-indicator");
    const text = container.querySelector(".result-text");
    container.classList.toggle("is-positive", state?.status === "solved");
    container.classList.toggle("is-negative", state?.status === "unsolvable" || state?.status === "invalid");
    container.classList.toggle("is-pending", state?.status === "checking" || state?.status === "limit");
    indicator.textContent = state?.status === "solved" ? "✓" : state?.status === "unsolvable" ? "×" : state?.status === "checking" ? "…" : state?.status === "limit" ? "!" : "•";
    text.textContent = state?.message ?? "Check this level to see if it can be solved.";
}

function resetCheck(target) {
    checkState[target] = null;
    solutions[target] = null;
    if (mode === target) isRevealed = false;
    const resultElement = document.querySelector(`#${target}-result`);
    updateResult(resultElement, null);
    document.querySelector(`#reveal-${target}`).disabled = true;
}

function setBusy(value, buttonId) {
    busy = value;
    document.querySelectorAll(".button").forEach((button) => {
        button.disabled = value || (button.id.startsWith("reveal-") && checkState[button.id.slice(7)]?.status !== "solved");
    });
    if (buttonId) document.querySelector(`#${buttonId}`).disabled = value;
    if (!value) updateCustomControls();
}

function updateCustomControls() {
    const remaining = PIECES.filter((piece) => piece.setup && !customPlacements.some((placement) => placement.id === piece.id)).length;
    const rotateButton = document.querySelector("#rotate-piece");
    document.querySelector("#selection-note").textContent = selectedPieceId
        ? `Selected: ${setupPiece(selectedPieceId).name}. ${vertical ? "Vertical" : "Horizontal"} placement. Tap the top-left cell.`
        : remaining === 0 ? "All black pieces are placed. Check the setup." : `${remaining} black piece${remaining === 1 ? "" : "s"} left to place.`;
    rotateButton.disabled = !selectedPieceId || setupPiece(selectedPieceId).height === setupPiece(selectedPieceId).width;
    rotateButton.setAttribute("aria-label", selectedPieceId
        ? `Rotate selected piece to ${vertical ? "horizontal" : "vertical"}`
        : "Rotate selected piece");
    rotateButton.querySelector("span").textContent = `To ${vertical ? "horizontal" : "vertical"}`;
    document.querySelector("#check-custom").disabled = busy || remaining !== 0;
    document.querySelector("#clear-custom").disabled = busy || customPlacements.length === 0;
    document.querySelector("#reveal-custom").disabled = busy || checkState.custom?.status !== "solved";
}

function handleCustomCell(row, col, entry) {
    if (entry?.piece.color === "black") {
        customPlacements = customPlacements.filter((placement) => placement.id !== entry.placement.id);
        selectedPieceId = entry.placement.id;
        vertical = entry.placement.height > entry.placement.width;
        resetCheck("custom");
        renderBoard();
        updateCustomControls();
        return;
    }
    if (!selectedPieceId || entry) return;

    const piece = setupPiece(selectedPieceId);
    if (customPlacements.some((placement) => placement.id === selectedPieceId)) return;
    const height = vertical && piece.height !== piece.width ? piece.width : piece.height;
    const width = vertical && piece.height !== piece.width ? piece.height : piece.width;
    if (row + height > 8 || col + width > 8) {
        const result = { status: "invalid", message: "That piece extends beyond the board." };
        checkState.custom = result;
        updateResult(document.querySelector("#custom-result"), result);
        return;
    }

    for (let y = row; y < row + height; y += 1) {
        for (let x = col; x < col + width; x += 1) {
            if (customPlacements.some((placement) => y >= placement.row && y < placement.row + placement.height && x >= placement.col && x < placement.col + placement.width)) {
                const result = { status: "invalid", message: "Black pieces cannot overlap." };
                checkState.custom = result;
                updateResult(document.querySelector("#custom-result"), result);
                return;
            }
        }
    }

    customPlacements = [...customPlacements, { id: selectedPieceId, row, col, height, width }];
    selectedPieceId = null;
    vertical = false;
    resetCheck("custom");
    renderBoard();
    updateCustomControls();
}

function setPanelMode(nextMode) {
    mode = nextMode;
    isRevealed = false;
    document.querySelector("#reveal-random").disabled = mode !== "random" || checkState.random?.status !== "solved";
    document.querySelector("#reveal-custom").disabled = mode !== "custom" || checkState.custom?.status !== "solved";
    document.querySelector("#random-tab").classList.toggle("is-active", mode === "random");
    document.querySelector("#custom-tab").classList.toggle("is-active", mode === "custom");
    document.querySelector("#random-tab").setAttribute("aria-selected", String(mode === "random"));
    document.querySelector("#custom-tab").setAttribute("aria-selected", String(mode === "custom"));
    document.querySelector("#random-panel").hidden = false;
    document.querySelector("#random-controls").hidden = mode !== "random";
    document.querySelector("#custom-controls").hidden = mode !== "custom";
    document.querySelector("#board-kicker").textContent = mode === "random" ? "GENERATED CHALLENGE" : "YOUR SETUP";
    document.querySelector("#board-title").textContent = mode === "random" ? "Your next puzzle" : "Place the blockers";
    document.querySelector("#panel-step").textContent = mode === "random" ? `LEVEL ${String(generatedLevel?.seed ?? 1).slice(-2).padStart(2, "0")}` : "CUSTOM LEVEL";
    renderBoard();
    if (mode === "custom") updateCustomControls();
}

async function newRandomLevel() {
    if (busy) return;
    setBusy(true, "new-level");
    document.querySelector("#board-title").textContent = "Finding a fresh fit…";
    const seed = Math.floor(Math.random() * 2_000_000_000);
    const result = await askWorker("generate", { seed });
    setBusy(false);
    if (result.status !== "solved") {
        generatedLevel = null;
        checkState.random = { status: result.status, message: result.status === "limit" ? "Search reached its safety limit. Try another level." : "Could not generate a level. Try again." };
    } else {
        generatedLevel = result;
        checkState.random = null;
    }
    solutions.random = null;
    isRevealed = false;
    document.querySelector("#board-title").textContent = "Your next puzzle";
    document.querySelector("#panel-step").textContent = `LEVEL ${String(seed).slice(-2).padStart(2, "0")}`;
    updateResult(document.querySelector("#random-result"), checkState.random);
    renderBoard();
    document.querySelector("#check-random").disabled = !generatedLevel;
    document.querySelector("#reveal-random").disabled = true;
}

async function checkActiveLevel(target) {
    if (busy) return;
    const placements = target === "random" ? generatedLevel?.blackPlacements : customPlacements;
    if (!placements || placements.length !== 3) {
        const invalid = { status: "invalid", message: "Place all three black pieces first." };
        checkState[target] = invalid;
        updateResult(document.querySelector(`#${target}-result`), invalid);
        return;
    }

    checkState[target] = { status: "checking", message: "Checking the fit…" };
    updateResult(document.querySelector(`#${target}-result`), checkState[target]);
    setBusy(true, `check-${target}`);
    const result = await askWorker("solve", { placements });
    setBusy(false);
    if (result.status === "solved") {
        solutions[target] = result.solution;
        checkState[target] = { status: "solved", message: `Solvable. A complete fit is ready to reveal. (${result.nodes.toLocaleString()} placements checked)` };
    } else if (result.status === "unsolvable") {
        solutions[target] = null;
        checkState[target] = { status: "unsolvable", message: `Not solvable with these black pieces. (${result.nodes.toLocaleString()} placements checked)` };
    } else if (result.status === "limit") {
        solutions[target] = null;
        checkState[target] = { status: "limit", message: "The search reached its safety limit. No solvability claim was made; try a different setup." };
    } else {
        solutions[target] = null;
        checkState[target] = { status: "invalid", message: result.message };
    }
    updateResult(document.querySelector(`#${target}-result`), checkState[target]);
    document.querySelector(`#reveal-${target}`).disabled = checkState[target].status !== "solved";
    updateCustomControls();
}

function revealSolution() {
    if (checkState[mode]?.status !== "solved" || !solutions[mode]) return;
    isRevealed = true;
    renderBoard();
    document.querySelector("#board-title").textContent = "Complete solution";
    document.querySelector("#board-kicker").textContent = "SOLUTION REVEALED";
}

function renderFullSet() {
    const container = document.querySelector("#full-piece-list");
    for (const piece of PIECES) {
        const item = document.createElement("div");
        item.className = "full-piece";
        item.append(renderPieceShape(piece));
        const label = document.createElement("span");
        label.textContent = piece.setup ? `Black ${piece.height} × ${piece.width}` : `${piece.color[0].toUpperCase()}${piece.color.slice(1)} ${piece.height} × ${piece.width}`;
        item.append(label);
        container.append(item);
    }
}

document.querySelector("#random-tab").addEventListener("click", () => setPanelMode("random"));
document.querySelector("#custom-tab").addEventListener("click", () => setPanelMode("custom"));
document.querySelector("#new-level").addEventListener("click", newRandomLevel);
document.querySelector("#check-random").addEventListener("click", () => checkActiveLevel("random"));
document.querySelector("#check-custom").addEventListener("click", () => checkActiveLevel("custom"));
document.querySelector("#reveal-random").addEventListener("click", revealSolution);
document.querySelector("#reveal-custom").addEventListener("click", revealSolution);
document.querySelector("#rotate-piece").addEventListener("click", () => {
    if (!selectedPieceId) return;
    vertical = !vertical;
    renderBoard();
    updateCustomControls();
});
document.querySelector("#clear-custom").addEventListener("click", () => {
    customPlacements = [];
    selectedPieceId = null;
    vertical = false;
    resetCheck("custom");
    renderBoard();
    updateCustomControls();
});
document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r" && mode === "custom" && selectedPieceId && !event.metaKey && !event.ctrlKey) {
        vertical = !vertical;
        renderBoard();
        updateCustomControls();
    }
});

renderFullSet();
renderBoard();
updateCustomControls();
newRandomLevel();