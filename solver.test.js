import test from "node:test";
import assert from "node:assert/strict";
import { BOARD_SIZE, FULL_MASK, PIECES, generateRandomLevel, solveCustomLevel } from "./solver.js";

function placementMask(placement) {
    let mask = 0n;
    for (let row = placement.row; row < placement.row + placement.height; row += 1) {
        for (let col = placement.col; col < placement.col + placement.width; col += 1) {
            mask |= 1n << BigInt(row * BOARD_SIZE + col);
        }
    }
    return mask;
}

test("piece areas exactly fill the 8 x 8 base", () => {
    const area = PIECES.reduce((sum, piece) => sum + piece.height * piece.width, 0);
    assert.equal(area, 64);
});

test("random levels produce a complete valid tiling and can be solved", () => {
    const level = generateRandomLevel(421);
    assert.equal(level.status, "solved");
    assert.equal(level.solution.length, PIECES.length);

    let occupied = 0n;
    for (const placement of level.solution) {
        const mask = placementMask(placement);
        assert.equal(mask & occupied, 0n, `${placement.id} overlaps another piece`);
        occupied |= mask;
    }
    assert.equal(occupied, FULL_MASK);

    const result = solveCustomLevel(level.blackPlacements);
    assert.equal(result.status, "solved");
    assert.equal(result.solution.length, PIECES.length);
});

test("custom setup rejects overlapping black pieces", () => {
    const result = solveCustomLevel([
        { id: "black-1x3", row: 0, col: 0, height: 1, width: 3 },
        { id: "black-1x2", row: 0, col: 2, height: 1, width: 2 },
        { id: "black-1x1", row: 7, col: 7, height: 1, width: 1 },
    ]);
    assert.equal(result.status, "invalid");
    assert.match(result.message, /overlap/i);
});

test("custom setup accepts horizontal and vertical black pieces", () => {
    const setups = [
        [
            { id: "black-1x3", row: 0, col: 0, height: 1, width: 3 },
            { id: "black-1x2", row: 0, col: 3, height: 1, width: 2 },
            { id: "black-1x1", row: 0, col: 5, height: 1, width: 1 },
        ],
        [
            { id: "black-1x3", row: 0, col: 0, height: 3, width: 1 },
            { id: "black-1x2", row: 0, col: 2, height: 2, width: 1 },
            { id: "black-1x1", row: 0, col: 4, height: 1, width: 1 },
        ],
    ];

    for (const placements of setups) {
        const result = solveCustomLevel(placements, { maxNodes: 0 });
        assert.equal(result.status, "limit");
    }
});

test("custom setup requires each black piece exactly once", () => {
    const result = solveCustomLevel([
        { id: "black-1x3", row: 0, col: 0, height: 1, width: 3 },
        { id: "black-1x2", row: 1, col: 0, height: 1, width: 2 },
    ]);
    assert.equal(result.status, "invalid");
    assert.match(result.message, /all three/i);
});