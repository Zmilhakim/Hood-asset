import { Connect } from "@/components/Connect";
import { DockLog } from "@/components/DockLog";
import { Strap } from "@/components/Strap";
import { Tag } from "@/components/Tag";
import { Till, TillClosed } from "@/components/Till";
import { Contract } from "@/components/Contract";
import { LAUNCHED, ROUTER_ADDRESS, SUPPLY, TOKEN_ADDRESS } from "@/lib/addresses";
import { DEFAULT_EXPLORER_URL } from "@/lib/chain";
import { X_HANDLE, X_URL } from "@/lib/site";

const CrateMark = () => (
  <svg viewBox="0 0 64 64" aria-hidden width="44" height="44" style={{ flex: "none" }}>
    <path d="M8 8h48v8H8zM8 48h48v8H8zM8 18h8v28H8zM48 18h8v28h-8zM18 43L43 18h3v3L21 46h-3z" fill="#231B13" />
    <circle cx="32" cy="32" r="9" fill="#B02A1F" />
    <circle cx="32" cy="32" r="5.5" fill="none" stroke="#C94A3B" strokeWidth="1.5" />
  </svg>
);

export default function Dock() {
  return (
    <>
      <div className="wrap">
        <header className="top">
          <a href="#top" className="brand">
            <CrateMark />
            <b className="stencil paint">Crate</b>
          </a>
          <nav className="nav" aria-label="Sections">
            <a href="#log">Dock log</a>
            <a href="#receiving">Receiving</a>
            <a href="#notes">Notes</a>
          </nav>
          <Connect />
        </header>
      </div>

      <Strap />

      <main id="top" className="wrap">
        <section className="hero">
          <div>
            <h1 className="stencil paint">
              <span>One crate</span>
              <span>on the dock.</span>
            </h1>
            <p className="sub">
              $CRATE ships on Robinhood Chain. Packed once, sealed once, and nobody opens it. Every figure on this
              dock is read from the pool itself — not from an indexer, and not typed in by hand.
            </p>
            <Contract />
          </div>

          <Tag />
        </section>

        <section className="sheet" id="buy" aria-labelledby="buyTitle">
          <span className="clip" aria-hidden />
          <h2 className="title" id="buyTitle">
            The till
          </h2>
          <p className="lede">
            Buy and sell here, against the pool itself. Quotes come from Uniswap&rsquo;s own quoter, and every trade
            carries a floor and a deadline — under either, it reverts rather than fills.
          </p>
          <div className="till-wrap">{LAUNCHED ? <Till /> : <TillClosed />}</div>
        </section>

        <section className="sheet" id="log" aria-labelledby="logTitle">
          <span className="clip" aria-hidden />
          <h2 className="title" id="logTitle">
            The dock
          </h2>
          <p className="lede">
            Every transfer of $CRATE lands in the log. The manifest lists what the chain says about the crate itself.
          </p>

          <DockLog />

          <ul className="manifest" style={{ marginTop: 28 }}>
            <li>
              <span className="k">Contents</span>
              <span className="v">{SUPPLY.toLocaleString("en-US")} $CRATE</span>
            </li>
            <li>
              <span className="k">Route</span>
              <span className="v">Robinhood Chain, ID 4663</span>
            </li>
            <li>
              <span className="k">Paired with</span>
              <span className="v">Native ETH — no WETH, no hook</span>
            </li>
            <li>
              <span className="k">Contract</span>
              <span className="v">
                {TOKEN_ADDRESS ? (
                  <a href={`${DEFAULT_EXPLORER_URL}/token/${TOKEN_ADDRESS}`} target="_blank" rel="noreferrer">
                    {TOKEN_ADDRESS}
                  </a>
                ) : (
                  "Posted at launch"
                )}
              </span>
            </li>
            <li>
              <span className="k">Router</span>
              <span className="v">
                {ROUTER_ADDRESS ? (
                  <a href={`${DEFAULT_EXPLORER_URL}/address/${ROUTER_ADDRESS}`} target="_blank" rel="noreferrer">
                    {ROUTER_ADDRESS}
                  </a>
                ) : (
                  "Posted at launch"
                )}
              </span>
            </li>
            <li>
              <span className="k">Liquidity</span>
              <span className="v">Sealed — no contract can withdraw it</span>
            </li>
            <li>
              <span className="k">Trade fee</span>
              <span className="v">1%, paid to the crate&rsquo;s fee address</span>
            </li>
            <li>
              <span className="k">Opened</span>
              <span className="v">Never</span>
            </li>
          </ul>
          <p className="foot-note">
            Price, valuation and the ETH sealed in are read from Uniswap&rsquo;s pool manager. The shipment log comes
            from Blockscout, the chain&rsquo;s explorer — history, not arithmetic. Nothing here is typed in by hand.
          </p>
        </section>

        <section className="sheet" id="receiving" aria-labelledby="recTitle">
          <span className="clip" aria-hidden />
          <h2 className="title" id="recTitle">
            Receiving
          </h2>
          <p className="lede">How to take delivery of $CRATE. Four steps, one wallet.</p>
          <div className="split">
            <ol className="steps">
              <li>
                <div>
                  <h3>Get an EVM wallet</h3>
                  <p>Any wallet that can add a custom network works. Write down the recovery phrase and keep it offline.</p>
                </div>
              </li>
              <li>
                <div>
                  <h3>Add Robinhood Chain</h3>
                  <p>
                    Chain ID 4663. Add it from{" "}
                    <a href="https://chainlist.org/chain/4663" target="_blank" rel="noreferrer">
                      chainlist.org
                    </a>{" "}
                    so the network details are filled in for you, or let the button at the top switch it for you.
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <h3>Bring ETH</h3>
                  <p>Gas on Robinhood Chain is paid in ETH, and so is $CRATE. Bridge a little over before you buy.</p>
                </div>
              </li>
              <li>
                <div>
                  <h3>Buy at the till</h3>
                  <p>
                    Connect, type an amount, and check the minimum before you sign. Selling asks for an approval
                    first — for exactly the amount you are selling, not an unlimited one.
                  </p>
                </div>
              </li>
            </ol>
            <aside className="notice" aria-labelledby="noticeTitle">
              <h3 id="noticeTitle">Before you buy</h3>
              <p>
                $CRATE is a memecoin. It has no roadmap, no promise and no value beyond what people give it. You can
                lose everything you put in.
              </p>
              <p>
                Locked liquidity is not a floor. It means the money paid for supply stays in the pool — it does not
                mean the price cannot fall.
              </p>
              <p>The contracts are not audited. Robinhood Chain is run by Robinhood; $CRATE is not made, checked or backed by them.</p>
              <p>The only contract address is the one on this page and in the pinned post. Anything else is not the crate.</p>
            </aside>
          </div>
        </section>

        <section className="sheet" id="notes" aria-labelledby="notesTitle">
          <span className="clip" aria-hidden />
          <h2 className="title" id="notesTitle">
            Notes
          </h2>
          <p className="lede">Short notes pinned to the crate. Plain sentences, nothing to read twice.</p>
          <div className="notes">
            <details>
              <summary>What is in the crate</summary>
              <p>$CRATE. Nothing else. No roadmap folded inside, no second box underneath, and nothing set aside for a team.</p>
            </details>
            <details>
              <summary>Why the liquidity cannot come out</summary>
              <p>
                In Uniswap v4 a position is not an NFT — it is a row in the pool manager belonging to the contract
                that added it. That contract has no function that removes liquidity: every liquidity change in it is
                zero or positive. So there is nothing to transfer, sell, borrow against or approve away, and no
                address — including whoever packed it — can withdraw it.
              </p>
            </details>
            <details>
              <summary>Where the trade fee goes</summary>
              <p>
                To one address, fixed inside the seal when it was deployed, with no function anywhere that changes
                it. That is the project&rsquo;s only income. The rest of what people pay for supply stays in the pool.
              </p>
            </details>
            <details>
              <summary>Where the numbers come from</summary>
              <p>
                Price, valuation and the ETH sealed in are read out of Uniswap&rsquo;s pool manager, so they are right
                in the block the pool is created rather than whenever an indexer notices it. The shipment log comes
                from Blockscout. The page checks again every few seconds.
              </p>
            </details>
            <details>
              <summary>Why it stays shut</summary>
              <p>A sealed crate is worth whatever people think is inside. Open it and the question is answered.</p>
            </details>
          </div>
        </section>
      </main>

      <footer className="wrap" style={{ padding: "20px 0 60px" }}>
        <p className="stencil paint big">
          Sealed once.
          <br />
          Never reopened.
        </p>
        <div className="label">
          <div className="row">
            <a href={X_URL} target="_blank" rel="noreferrer">
              {X_HANDLE}
            </a>
            <a href={DEFAULT_EXPLORER_URL} target="_blank" rel="noreferrer">
              Explorer
            </a>
          </div>
          <p className="fine">
            $CRATE is a memecoin on Robinhood Chain with no affiliation to Robinhood Markets, Inc. Nothing on this
            page is financial advice.
          </p>
        </div>
      </footer>
    </>
  );
}
