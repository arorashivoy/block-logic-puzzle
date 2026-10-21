export const BOARD_SIZE = 8;
export const FULL_MASK = (1n << 64n) - 1n;

export const PIECES = [
    { id: "white-3", name: "White 3 x 3", color: "white", height: 3, width: 3 },
    { id: "white-2", name: "White 2 x 2", color: "white", height: 2, width: 2 },
    { id: "blue-3x4", name: "Blue 3 x 4", color: "blue", height: 3, width: 4 },
    { id: "blue-5x2", name: "Blue 5 x 2", color: "blue", height: 5, width: 2 },
    { id: "red-2x4", name: "Red 2 x 4", color: "red", height: 2, width: 4 },
    { id: "red-2x3", name: "Red 2 x 3", color: "red", height: 2, width: 3 },
    { id: "yellow-1x4", name: "Yellow 1 x 4", color: "yellow", height: 1, width: 4 },
    { id: "yellow-1x5", name: "Yellow 1 x 5", color: "yellow", height: 1, width: 5 },
    { id: "black-1x3", name: "Black 1 x 3", color: "black", height: 1, width: 3, setup: true },
    { id: "black-1x2", name: "Black 1 x 2", color: "black", height: 1, width: 2, setup: true },
    { id: "black-1x1", name: "Black 1 x 1", color: "black", height: 1, width: 1, setup: true },
];

const PIECE_BY_ID = new Map(PIECES.map((piece) => [piece.id, piece]));

function makePlacement(piece, row, col, height, width) {
    if (row < 0 || col < 0 || row + height > BOARD_SIZE || col + width > BOARD_SIZE) {
        return null;
    }

    let mask = 0n;
    const cells = [];
    for (let y = row; y < row + height; y += 1) {
        for (let x = col; x < col + width; x += 1) {
            const index = y * BOARD_SIZE + x;
            cells.push(index);
            mask |= 1n << BigInt(index);
        }
    }

    return { id: piece.id, color: piece.color, row, col, height, width, cells, mask };
}

function getPlacements(piece) {
    const dimensions = [[piece.height, piece.width]];
    if (piece.height !== piece.width) dimensions.push([piece.width, piece.height]);

    const placements = [];
    for (const [height, width] of dimensions) {
        for (let row = 0; row <= BOARD_SIZE - height; row += 1) {
            for (let col = 0; col <= BOARD_SIZE - width; col += 1) {
                placements.push(makePlacement(piece, row, col, height, width));
            }
        }
    }
    return placements;
}

const CELL_MASKS = Array.from({ length: 64 }, (_, cell) => 1n << BigInt(cell));
const PLACEMENTS_BY_CELL = Array.from({ length: 64 }, () => []);

for (const piece of PIECES) {
    for (const placement of getPlacements(piece)) {
        for (const cell of placement.cells) PLACEMENTS_BY_CELL[cell].push(placement);
    }
}

function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
        value += 0x6d2b79f5;
        let mixed = value;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(items, random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

function validateFixedPlacements(fixedPlacements, expectedPieces, requireAll = true) {
    if (!Array.isArray(fixedPlacements)) return { error: "Place all three black pieces first." };

    const expectedIds = new Set(expectedPieces.map((piece) => piece.id));
    const seen = new Set();
    let occupied = 0n;
    const fixed = [];

    for (const input of fixedPlacements) {
        const piece = PIECE_BY_ID.get(input.id);
        if (!piece || !expectedIds.has(input.id) || seen.has(input.id)) {
            return { error: "Each black piece must appear exactly once." };
        }
        if (![input.row, input.col, input.height, input.width].every(Number.isInteger)) {
            return { error: "A black piece has an invalid position or orientation." };
        }

        const allowedDimensions = [[piece.height, piece.width]];
        if (piece.height !== piece.width) allowedDimensions.push([piece.width, piece.height]);
        if (!allowedDimensions.some(([height, width]) => height === input.height && width === input.width)) {
            return { error: `${piece.name} has an invalid orientation.` };
        }

        const placement = makePlacement(piece, input.row, input.col, input.height, input.width);
        if (!placement) return { error: `${piece.name} extends beyond the board.` };
        if ((placement.mask & occupied) !== 0n) return { error: "Black pieces cannot overlap." };
        occupied |= placement.mask;
        fixed.push(placement);
        seen.add(piece.id);
    }

    if (requireAll && seen.size !== expectedIds.size) return { error: "Place all three black pieces first." };
    return { occupied, fixed };
}

function searchTiling(
    pieces,
    fixedPlacements,
    { random = null, maxNodes = 1_500_000, requireAllFixed = true } = {},
) {
    const fixedValidation = validateFixedPlacements(
        fixedPlacements,
        pieces.filter((piece) => piece.setup),
        requireAllFixed,
    );
    if (fixedValidation.error) return { status: "invalid", message: fixedValidation.error, nodes: 0 };

    const fixedIds = new Set(fixedValidation.fixed.map((placement) => placement.id));
    const area = pieces.reduce((sum, piece) => sum + piece.height * piece.width, 0);
    const fixedArea = fixedValidation.fixed.reduce((sum, placement) => sum + placement.cells.length, 0);
    if (area !== 64 || fixedArea > area) {
        return { status: "invalid", message: "The piece areas do not match the 8 x 8 board.", nodes: 0 };
    }

    const used = new Set(fixedIds);
    const chosen = [...fixedValidation.fixed];
    let nodes = 0;
    let exceeded = false;

    function visit(occupied) {
        nodes += 1;
        if (nodes > maxNodes) {
            exceeded = true;
            return false;
        }

        if (used.size === pieces.length) return occupied === FULL_MASK;

        let bestCell = -1;
        let bestCount = Infinity;
        for (let cell = 0; cell < 64; cell += 1) {
            if ((occupied & CELL_MASKS[cell]) !== 0n) continue;

            let count = 0;
            for (const placement of PLACEMENTS_BY_CELL[cell]) {
                if (used.has(placement.id) || (placement.mask & occupied) !== 0n) continue;
                count += 1;
                if (count >= bestCount) break;
            }
            if (count === 0) return false;
            if (count < bestCount) {
                bestCell = cell;
                bestCount = count;
                if (bestCount === 1) break;
            }
        }

        if (bestCell === -1) return false;
        const bestOptions = [];
        for (const placement of PLACEMENTS_BY_CELL[bestCell]) {
            if (!used.has(placement.id) && (placement.mask & occupied) === 0n) bestOptions.push(placement);
        }
        const options = random ? shuffle(bestOptions, random) : bestOptions;
        for (const placement of options) {
            used.add(placement.id);
            chosen.push(placement);
            if (visit(occupied | placement.mask)) return true;
            chosen.pop();
            used.delete(placement.id);
            if (exceeded) return false;
        }
        return false;
    }

    const solved = visit(fixedValidation.occupied);
    if (solved) {
        return {
            status: "solved",
            solution: chosen.map(({ mask, cells, ...placement }) => placement),
            nodes,
        };
    }
    return { status: exceeded ? "limit" : "unsolvable", nodes };
}

export function solveCustomLevel(blackPlacements, options = {}) {
    return searchTiling(PIECES, blackPlacements, options);
}

export function generateRandomLevel(seed = Date.now(), options = {}) {
    const random = seededRandom(seed);
    const generated = searchTiling(PIECES, [], {
        ...options,
        random,
        requireAllFixed: false,
    });
    if (generated.status !== "solved") return generated;

    const blackPlacements = generated.solution.filter((placement) => placement.color === "black");
    return {
        status: "solved",
        seed,
        blackPlacements,
        solution: generated.solution,
        nodes: generated.nodes,
    };
}