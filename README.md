# Block Logic

A browser puzzle studio for the Kidology-style 8 x 8 color block puzzle.

## Run locally

```sh
npm test
npm start
```

Open `http://localhost:4173`.

## Run with Docker

```sh
docker build -t block-logic .
docker run --rm -p 8080:80 block-logic
```

Open `http://localhost:8080`.

## Puzzle model

The board is 8 x 8. Each level uses one of each piece listed in the app, with each rectangle allowed to rotate by 90 degrees. All 11 pieces cover exactly 64 cells. Generated levels start from a valid complete tiling, then show only the three black pieces. Custom setups accept the three black pieces, test whether the remaining pieces can cover the board, and reveal a solution only after a successful check.

The solver runs in a Web Worker. If a search reaches its node limit, the app reports that it could not decide instead of claiming that the setup is unsolvable.