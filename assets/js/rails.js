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

  // Escrow address resolution, strongest first (crowdstake.fun convention):
  //   1. localStorage("dp-escrow-<net>") — e2e/preview pins (anvil)
  //   2. the runtime manifest published by the contracts-deploy workflow to
  //      the `addresses` branch (raw.githubusercontent.com sends CORS headers;
  //      release-asset downloads do not) — deploys go live with NO rebuild
  //   3. baked-in fallbacks below
  const ESCROW = {
    gnosis: "0xfc1bbce6e2b1353f4c3f2e52fb78d5c6d2fef19e", // deployed via etherform CI, run 29145602518
    chiado: null,
    local: null,
  };
  // share-house.fun's CommuneOS (vendored from communetxyz/commune-os-sc) —
  // the optional on-chain chore log. Same resolution: pin > manifest > baked.
  const COMMUNE_OS = {
    gnosis: "0x6826877a57929243d4549f84cdd4b7ea0bc217ec", // etherform CI run 29146804272
    chiado: null,
    local: null,
  };
  const MANIFEST_URL = "https://raw.githubusercontent.com/RonTuretzky/commons-coliving/addresses/addresses.json";
  const CHAIN_IDS = { gnosis: "100", chiado: "10200" };
  const KEY_MANIFEST = "dp-addresses";

  function manifestAddr(netKey, key) {
    try {
      const m = JSON.parse(localStorage.getItem(KEY_MANIFEST) || "null");
      const entry = m && m.chains && m.chains[CHAIN_IDS[netKey]];
      const addr = entry && entry[key];
      return /^0x[0-9a-fA-F]{40}$/.test(addr || "") ? addr : null;
    } catch (e) { return null; }
  }

  async function hydrateAddresses() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(MANIFEST_URL, { cache: "no-store", signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return;
      const m = await r.json();
      if (m && m.chains) {
        localStorage.setItem(KEY_MANIFEST, JSON.stringify(m));
        window.dispatchEvent(new Event("rails:addresses"));
      }
    } catch (e) { /* offline or branch not published yet — fallbacks stand */ }
  }

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

  const COMMUNE_ABI = [
    { type: "function", name: "createCommune", stateMutability: "nonpayable",
      inputs: [
        { name: "name", type: "string" }, { name: "collateralRequired", type: "bool" },
        { name: "collateralAmount", type: "uint256" },
        { name: "choreSchedules", type: "tuple[]", components: [
          { name: "id", type: "uint256" }, { name: "title", type: "string" },
          { name: "frequency", type: "uint256" }, { name: "startTime", type: "uint256" },
          { name: "deleted", type: "bool" },
        ]},
        { name: "username", type: "string" },
      ], outputs: [{ name: "communeId", type: "uint256" }] },
    { type: "function", name: "markChoreComplete", stateMutability: "nonpayable",
      inputs: [{ name: "communeId", type: "uint256" }, { name: "choreId", type: "uint256" }, { name: "period", type: "uint256" }], outputs: [] },
    { type: "function", name: "choreScheduler", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  ];
  const SCHEDULER_ABI = [
    { type: "function", name: "isChoreComplete", stateMutability: "view",
      inputs: [{ name: "communeId", type: "uint256" }, { name: "choreId", type: "uint256" }, { name: "period", type: "uint256" }],
      outputs: [{ name: "", type: "bool" }] },
  ];

  function netId() { return localStorage.getItem(KEY_CHAIN) || "gnosis"; }
  function net() { return NETWORKS[netId()] || NETWORKS.gnosis; }
  function escrowAddress() {
    return localStorage.getItem("dp-escrow-" + netId()) || manifestAddr(netId(), "gatheringEscrow") || ESCROW[netId()] || null;
  }
  function communeOsAddress() {
    return localStorage.getItem("dp-communeos-" + netId()) || manifestAddr(netId(), "communeOS") || COMMUNE_OS[netId()] || null;
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

    // ---- CommuneOS: the optional on-chain chore log (share-house.fun model) ----
    commune: {
      available: () => !!communeOsAddress() && !!localStorage.getItem(KEY_WALLET),
      address: communeOsAddress,
      // chores: [{onchainId, name, freqDays, startMs}]
      async create(houseName, chores) {
        const client = wal();
        const schedules = chores.map((c) => ({
          id: BigInt(c.onchainId),
          title: c.name,
          frequency: BigInt(Math.max(1, Math.round(c.freqDays * 86400))),
          startTime: BigInt(Math.floor(c.startMs / 1000)),
          deleted: false,
        }));
        const hash = await client.writeContract({
          address: communeOsAddress(), abi: COMMUNE_ABI, functionName: "createCommune",
          args: [houseName, false, 0n, schedules, "colive.fun"],
        });
        const receipt = await pub().waitForTransactionReceipt({ hash });
        // CommuneCreated(uint256 indexed communeId, string, address indexed, bool, uint256)
        const topic = V.keccak256(V.stringToBytes("CommuneCreated(uint256,string,address,bool,uint256)"));
        const log = receipt.logs.find((l) => l.topics && l.topics[0] === topic);
        if (!log) throw new Error("no CommuneCreated event");
        return { communeId: Number(BigInt(log.topics[1])), hash };
      },
      async markComplete(communeId, choreId, period) {
        const client = wal();
        const hash = await client.writeContract({
          address: communeOsAddress(), abi: COMMUNE_ABI, functionName: "markChoreComplete",
          args: [BigInt(communeId), BigInt(choreId), BigInt(period)],
        });
        await pub().waitForTransactionReceipt({ hash });
        return hash;
      },
      async schedulerAddress() {
        return await pub().readContract({ address: communeOsAddress(), abi: COMMUNE_ABI, functionName: "choreScheduler", args: [] });
      },
      async isComplete(communeId, choreId, period) {
        const sched = await this.schedulerAddress();
        return await pub().readContract({
          address: sched, abi: SCHEDULER_ABI, functionName: "isChoreComplete",
          args: [BigInt(communeId), BigInt(choreId), BigInt(period)],
        });
      },
    },

    hydrateAddresses,
    short: (addr) => (addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : ""),
    explorerTx: (hash) => (net().explorer ? net().explorer + "/tx/" + hash : null),
    explorerAddr: (addr) => (net().explorer ? net().explorer + "/address/" + addr : null),
  };

  hydrateAddresses(); // fire-and-forget; pages listen for "rails:addresses"
})();
