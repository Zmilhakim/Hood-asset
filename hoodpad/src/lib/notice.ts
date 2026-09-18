/**
 * What the board renders, independent of which board it came from.
 *
 * The v3 and v4 notices differ where the chain differs — v3 carries an NFT
 * position id and a pool address, v4 carries a pool id and the four numbers that
 * rebuild its pool key — but a notice on the feed is the same notice either way.
 * This is the part they share, so the card that draws it needs no branch and no
 * second copy.
 */
export type BoardNotice = {
  token: `0x${string}`;
  poster: `0x${string}`;
  name: string;
  symbol: string;
  imageURI: string;
  blurb: string;
  link: string;
  supply: bigint;
  postedAt: bigint;
};
