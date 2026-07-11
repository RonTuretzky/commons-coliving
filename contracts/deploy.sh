#!/usr/bin/env bash
# Deploy GatheringEscrow. Usage:
#   PRIVATE_KEY=0x... ./deploy.sh gnosis     (or: chiado)
#   ./deploy.sh gnosis                       (reads ~/.colive-deployer.key)
set -euo pipefail
NET="${1:-gnosis}"
case "$NET" in
  gnosis) RPC="https://rpc.gnosischain.com" ;;
  chiado) RPC="https://rpc.chiadochain.net" ;;
  local)  RPC="http://127.0.0.1:8545" ;;
  *) echo "unknown network $NET"; exit 1 ;;
esac
KEY="${PRIVATE_KEY:-$(cat ~/.colive-deployer.key)}"
cd "$(dirname "$0")"
"$HOME/.foundry/bin/forge" create src/GatheringEscrow.sol:GatheringEscrow \
  --rpc-url "$RPC" --private-key "$KEY" --broadcast
echo ""
echo "Now paste the deployed address into ESCROW.$NET in assets/js/rails.js and redeploy the site."
