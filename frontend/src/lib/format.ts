export const money = (paisa: number) =>
  new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(
    paisa / 100,
  );
