const layoutBlueprint = [
  // Row 1 - top row: seat 51, small seat 53, top Exit (mirrors bottom exit), Door, Boys Wash Room
  [
    { type: "seat", seatNumber: 51, orientation: "vertical" },
    { type: "seat", seatNumber: 53 },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "label", text: "Exit", className: "small-marker" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "label", text: "Door", className: "small-marker vertical" },
    { type: "label", text: "Boys Wash Room", className: "washroom" },
    { type: "space" },
  ],

  // Row 2 - seat 50, small seat 52, seats 45/49, seat 58/57
  [
    { type: "seat", seatNumber: 50, orientation: "vertical" },
    { type: "seat", seatNumber: 52 },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 45 },
    { type: "seat", seatNumber: 49 },
    { type: "space" },
    { type: "seat", seatNumber: 58, orientation: "vertical" },
    { type: "space" },
    { type: "seat", seatNumber: 57, orientation: "vertical" },
  ],

  // Row 3 - seat 11, Passage, seats 12/31, 44/48, 59/56
  [
    { type: "seat", seatNumber: 11, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 12 },
    { type: "seat", seatNumber: 31 },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 44 },
    { type: "seat", seatNumber: 48 },
    { type: "space" },
    { type: "seat", seatNumber: 59, orientation: "vertical" },
    { type: "space" },
    { type: "seat", seatNumber: 56, orientation: "vertical" },
  ],

  // Row 4 - seat 10, seats 13/30, 43/47, 60/55
  [
    { type: "seat", seatNumber: 10, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 13 },
    { type: "seat", seatNumber: 30 },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 43 },
    { type: "seat", seatNumber: 47 },
    { type: "space" },
    { type: "seat", seatNumber: 60, orientation: "vertical" },
    { type: "space" },
    { type: "seat", seatNumber: 55, orientation: "vertical" },
  ],

  // Row 5 - seat 9, seats 14/29, 42/46, 61/54
  [
    { type: "seat", seatNumber: 9, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 14 },
    { type: "seat", seatNumber: 29 },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 42 },
    { type: "seat", seatNumber: 46 },
    { type: "space" },
    { type: "seat", seatNumber: 61, orientation: "vertical" },
    { type: "space" },
    { type: "seat", seatNumber: 54, orientation: "vertical" },
  ],

  // Row 6 - seat 8, seats 15/28, Girls Wash Room
  [
    { type: "seat", seatNumber: 8, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 15 },
    { type: "seat", seatNumber: 28 },
    { type: "space" },
    { type: "space" },
    { type: "label", text: "Girls Wash Room", className: "washroom" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
  ],

  // Row 7 - seat 7, seats 16/27, 36/41
  [
    { type: "seat", seatNumber: 7, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 16 },
    { type: "seat", seatNumber: 27 },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 36 },
    { type: "seat", seatNumber: 41 },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
  ],

  // Row 8 - seat 6, seats 17/26, 35/40
  [
    { type: "seat", seatNumber: 6, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 17 },
    { type: "seat", seatNumber: 26 },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 35 },
    { type: "seat", seatNumber: 40 },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
  ],

  // Row 9 - seat 5, seats 18/25, 34/39
  [
    { type: "seat", seatNumber: 5, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 18 },
    { type: "seat", seatNumber: 25 },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 34 },
    { type: "seat", seatNumber: 39 },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
  ],

  // Row 10 - seat 4, seats 19/24, 33/38
  [
    { type: "seat", seatNumber: 4, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 19 },
    { type: "seat", seatNumber: 24 },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 33 },
    { type: "seat", seatNumber: 38 },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
  ],

  // Row 11 - seat 3, seats 20/23, 32/37
  [
    { type: "seat", seatNumber: 3, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 20 },
    { type: "seat", seatNumber: 23 },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 32 },
    { type: "seat", seatNumber: 37 },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
  ],

  // Row 12 - seat 2, seats 21/22
  [
    { type: "seat", seatNumber: 2, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "seat", seatNumber: 21 },
    { type: "seat", seatNumber: 22 },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
  ],

  // Row 13 - seat 1, bottom Exit (very last row)
  [
    { type: "seat", seatNumber: 1, orientation: "vertical" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "label", text: "Exit", className: "small-marker" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
    { type: "space" },
  ],
];

function getSeatNumbers() {
  return Array.from(
    new Set(
      layoutBlueprint
        .flat()
        .filter((cell) => cell.type === "seat")
        .map((cell) => cell.seatNumber)
    )
  ).sort((a, b) => a - b);
}

function buildSeatMap(seats) {
  const seatMap = new Map(seats.map((seat) => [seat.number, seat]));
  return layoutBlueprint.map((row) =>
    row.map((cell) => {
      if (cell.type !== "seat") {
        return cell;
      }

      return {
        ...cell,
        status: seatMap.get(cell.seatNumber)?.status || "VACANT",
      };
    })
  );
}

module.exports = {
  layoutBlueprint,
  getSeatNumbers,
  buildSeatMap,
};