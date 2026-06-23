import { useEffect, useRef } from "react";
import { AuthState, useTurnkey, type Wallet as TurnkeyWallet } from "@turnkey/react-wallet-kit";
import type { AuthSession } from "@/features/auth/types";
import { registerTurnkeyDefaultWallets, type TurnkeyWalletAccountRegistration } from "@/features/wallets/api/wallet-api";

// Each user gets one Solana + one EVM account, created inside THEIR Turnkey sub-organization using
// their own authenticated session (the user is the root member of their sub-org). The backend's
// parent-org API key cannot create wallets in a user's sub-org (Turnkey ORGANIZATION_MISMATCH), so
// provisioning must happen client-side and then be registered with Lotus. This restores the flow
// that commit 301194e removed.
const turnkeyDefaultAccountParams = [
  {
    curve: "CURVE_ED25519",
    pathFormat: "PATH_FORMAT_BIP32",
    path: "m/44'/501'/0'/0'",
    addressFormat: "ADDRESS_FORMAT_SOLANA",
  },
  {
    curve: "CURVE_SECP256K1",
    pathFormat: "PATH_FORMAT_BIP32",
    path: "m/44'/60'/0'/0/0",
    addressFormat: "ADDRESS_FORMAT_ETHEREUM",
  },
] as const;

const turnkeyWalletRegistrations = (wallets: TurnkeyWallet[]): TurnkeyWalletAccountRegistration[] =>
  wallets
    .flatMap((wallet) =>
      (wallet.accounts ?? [])
        .filter(
          (account) =>
            account.addressFormat === "ADDRESS_FORMAT_SOLANA" ||
            account.addressFormat === "ADDRESS_FORMAT_ETHEREUM",
        )
        .map((account) => ({
          providerWalletId: account.walletId ?? wallet.walletId,
          providerWalletAccountId: account.walletAccountId,
          address: account.address,
          addressFormat: account.addressFormat as TurnkeyWalletAccountRegistration["addressFormat"],
        })),
    )
    .filter((account) => Boolean(account.providerWalletId && account.providerWalletAccountId && account.address));

/**
 * Ensures the signed-in user has their default SOL + EVM wallets exactly once, then records them with
 * the Lotus backend. Idempotent: if the wallets already exist (in Turnkey and/or already registered)
 * nothing new is created. Runs once per session; a failed run is allowed to retry on the next login.
 */
export function WalletProvisioner({ session }: { session: AuthSession }) {
  const { authState, refreshWallets, createWallet, session: turnkeySession } = useTurnkey();
  const ranForRef = useRef<string | null>(null);

  useEffect(() => {
    // The SDK can report authState "unauthenticated" while a valid session (organizationId) exists,
    // so accept either signal as "Turnkey ready".
    const turnkeyReady = authState === AuthState.Authenticated || Boolean(turnkeySession?.organizationId);
    if (!session.userJwt || !turnkeyReady) {
      return;
    }
    // Run-once guard is the ONLY re-entry protection. We deliberately don't cancel the in-flight
    // run on cleanup: refreshWallets() mutates the SDK wallet state, which re-triggers this effect,
    // and a cancel-on-cleanup aborted provisioning right before registration. Registration is
    // idempotent, so always completing an in-flight run is safe.
    if (ranForRef.current === session.userId) {
      return;
    }
    ranForRef.current = session.userId;

    void (async () => {
      try {
        let activeWallets = await refreshWallets();
        if (turnkeyWalletRegistrations(activeWallets).length === 0) {
          await createWallet({
            walletName: "Lotus Wallet",
            accounts: [...turnkeyDefaultAccountParams],
            ...(turnkeySession?.organizationId ? { organizationId: turnkeySession.organizationId } : {}),
          });
          activeWallets = await refreshWallets();
        }
        const registrations = turnkeyWalletRegistrations(activeWallets);
        if (registrations.length > 0) {
          await registerTurnkeyDefaultWallets(session.userJwt, registrations);
        }
      } catch (error) {
        // Non-fatal: clear the guard so the next login retries provisioning.
        console.warn("[lotus] wallet provisioning failed; will retry next login.", error);
        ranForRef.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, session.userId, session.userJwt, turnkeySession?.organizationId]);

  return null;
}
