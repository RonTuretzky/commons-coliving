/* ============================================================
   colive.fun — Gnosis rails (real chain layer)
   Native xDai on Gnosis Chain: wallets are real addresses generated
   on this device (key never leaves it); gathering deposits go through
   the non-custodial GatheringEscrow contract. Requires vendor/viem.js.
   Load order: store.js → vendor/viem.js → rails.js → shell.js
   ============================================================ */
(function () {
  if (!window.Viem) { window.Rails = { enabled: false }; return; }
  const V = window.Viem;

  const KEY_WALLET = "dp-wallet-key";
  const KEY_CHAIN = "dp-chain";

  // Escrow deployments per network. Local/test networks can override via
  // localStorage("dp-escrow-<net>") — the e2e suite uses that with anvil.
  const ESCROW = {
    gnosis: null, // set after mainnet deployment
    chiado: null,
    local: null,
  };

  const NETWORKS = {
    gnosis: {
      label: "Gnosis Chain", nativeSymbol: "xDai",
      chain: V.defineChain({
        id: 100, name: "Gnosis",
        nativeCurrency: { name: "xDai", symbol: "XDAI", decimals: 18 },
        rpcUrls: { default: { http: ["https://gnosis-rpc.publicnode.com"] } },
      }),
      explorer: "https://gnosisscan.io",
      faucet: null,
    },
    chiado: {
      label: "Chiado testnet", nativeSymbol: "xDai (test)",
      chain: V.defineChain({
        id: 10200, name: "Chiado",
        nativeCurrency: { name: "xDai", symbol: "XDAI", decimals: 18 },
        rpcUrls: { default: { http: ["https://rpc.chiadochain.net"] } },
      }),
      explorer: "https://gnosis-chiado.blockscout.com",
      faucet: "https://faucet.chiadochain.net",
    },
    local: {
      label: "Local (anvil)", nativeSymbol: "xDai (local)",
      chain: V.defineChain({
        id: 31337, name: "Anvil",
        nativeCurrency: { name: "xDai", symbol: "XDAI", decimals: 18 },
        rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
      }),
      explorer: null,
      faucet: null,
    },
  };

  const ABI = [
    { type: "function", name: "create", stateMutability: "nonpayable",
      inputs: [{ name: "id", type: "bytes32" }, { name: "startsAt", type: "uint64" }, { name: "deposit_", type: "uint96" }], outputs: [] },
    { type: "function", name: "deposit", stateMutability: "payable",
      inputs: [{ name: "id", type: "bytes32" }], outputs: [] },
    { type: "function", name: "withdraw", stateMutability: "nonpayable",
      inputs: [{ name: "id", type: "bytes32" }], outputs: [] },
    { type: "function", name: "cancel", stateMutability: "nonpayable",
      inputs: [{ name: "id", type: "bytes32" }], outputs: [] },
    { type: "function", name: "claim", stateMutability: "nonpayable",
      inputs: [{ name: "id", type: "bytes32" }], outputs: [] },
    { type: "function", name: "gatherings", stateMutability: "view",
      inputs: [{ name: "", type: "bytes32" }],
      outputs: [
        { name: "host", type: "address" }, { name: "startsAt", type: "uint64" },
        { name: "deposit", type: "uint96" }, { name: "cancelled", type: "bool" },
        { name: "pot", type: "uint128" },
      ] },
    { type: "function", name: "deposits", stateMutability: "view",
      inputs: [{ name: "", type: "bytes32" }, { name: "", type: "address" }],
      outputs: [{ name: "", type: "uint96" }] },
  ];

  function netId() { return localStorage.getItem(KEY_CHAIN) || "gnosis"; }
  function net() { return NETWORKS[netId()] || NETWORKS.gnosis; }
  function escrowAddress() {
    return localStorage.getItem("dp-escrow-" + netId()) || ESCROW[netId()] || null;
  }

  function pub() {
    return V.createPublicClient({ chain: net().chain, transport: V.http() });
  }
  function wal() {
    const acct = account();
    if (!acct) return null;
    return V.createWalletClient({ account: acct, chain: net().chain, transport: V.http() });
  }
  function account() {
    const pk = localStorage.getItem(KEY_WALLET);
    return pk ? V.privateKeyToAccount(pk) : null;
  }

  async function escrowWrite(fn, idStr, value) {
    const client = wal();
    if (!client || !escrowAddress()) throw new Error("rails unavailable");
    const hash = await client.writeContract({
      address: escrowAddress(), abi: ABI, functionName: fn,
      args: [idFor(idStr)],
      ...(value ? { value } : {}),
    });
    await pub().waitForTransactionReceipt({ hash });
    return hash;
  }

  const idFor = (s) => V.keccak256(V.stringToBytes(String(s)));

  window.Rails = {
    enabled: true,
    net, netId,
    setNet(id) { if (NETWORKS[id]) localStorage.setItem(KEY_CHAIN, id); },

    hasWallet: () => !!localStorage.getItem(KEY_WALLET),
    address() { const a = account(); return a ? a.address : null; },
    ensureWallet() {
      if (!localStorage.getItem(KEY_WALLET)) {
        localStorage.setItem(KEY_WALLET, V.generatePrivateKey());
      }
      return this.address();
    },
    exportKey: () => localStorage.getItem(KEY_WALLET),
    importKey(pk) {
      // throws if invalid
      V.privateKeyToAccount(pk);
      localStorage.setItem(KEY_WALLET, pk);
      return this.address();
    },
    forgetWallet() { localStorage.removeItem(KEY_WALLET); },

    async balance() {
      const a = this.address();
      if (!a) return null;
      const b = await pub().getBalance({ address: a });
      return V.formatEther(b);
    },

    async send(to, xdai) {
      const client = wal();
      if (!client) throw new Error("no wallet");
      const hash = await client.sendTransaction({ to, value: V.parseEther(String(xdai)) });
      await pub().waitForTransactionReceipt({ hash });
      return hash;
    },

    escrow: {
      available: () => !!escrowAddress() && !!localStorage.getItem(KEY_WALLET),
      address: escrowAddress,
      idFor,
      async create(idStr, startsAtMs, depositXdai) {
        const client = wal();
        const hash = await client.writeContract({
          address: escrowAddress(), abi: ABI, functionName: "create",
          args: [idFor(idStr), BigInt(Math.floor(startsAtMs / 1000)), V.parseEther(String(depositXdai))],
        });
        await pub().waitForTransactionReceipt({ hash });
        return hash;
      },
      deposit: (idStr, xdai) => escrowWrite("deposit", idStr, V.parseEther(String(xdai))),
      withdraw: (idStr) => escrowWrite("withdraw", idStr),
      cancel: (idStr) => escrowWrite("cancel", idStr),
      claim: (idStr) => escrowWrite("claim", idStr),
      async info(idStr) {
        const [host, startsAt, deposit, cancelled, pot] = await pub().readContract({
          address: escrowAddress(), abi: ABI, functionName: "gatherings", args: [idFor(idStr)],
        });
        return { host, startsAt: Number(startsAt), deposit: V.formatEther(deposit), cancelled, pot: V.formatEther(pot) };
      },
      async myDeposit(idStr) {
        const a = account();
        if (!a) return "0";
        const d = await pub().readContract({
          address: escrowAddress(), abi: ABI, functionName: "deposits", args: [idFor(idStr), a.address],
        });
        return V.formatEther(d);
      },
    },

    short: (addr) => (addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : ""),
    explorerTx: (hash) => (net().explorer ? net().explorer + "/tx/" + hash : null),
    explorerAddr: (addr) => (net().explorer ? net().explorer + "/address/" + addr : null),
  };
})();
