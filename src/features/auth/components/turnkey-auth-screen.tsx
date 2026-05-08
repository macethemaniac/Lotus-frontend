import { ClientState, useTurnkey } from "@turnkey/react-wallet-kit";
import { assertTurnkeyConfigured } from "@/features/auth/api/turnkey-auth";
import { AuthPageMockup } from "@/design/mockups/AuthPageMockup";

export function TurnkeyAuthScreen({
  loading,
  error,
  onEmailSubmit,
  onError,
}: {
  loading: boolean;
  error: string | null;
  onEmailSubmit: (email: string) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { clientState, handleGoogleOauth, handleXOauth, handleLogin } = useTurnkey();
  const turnkeyReady = clientState === ClientState.Ready;
  const turnkeyError = clientState === ClientState.Error;

  const runTurnkeyFlow = async (flow: () => Promise<void>) => {
    try {
      assertTurnkeyConfigured();
      if (!turnkeyReady) {
        onError(turnkeyError ? "Turnkey login configuration failed to initialize." : "Secure login is still initializing. Try again in a moment.");
        return;
      }
      await flow();
    } catch (turnkeyError) {
      onError(turnkeyError instanceof Error ? turnkeyError.message : "Turnkey login failed.");
    }
  };

  return (
    <AuthPageMockup
      loading={loading || !turnkeyReady}
      error={error ?? (turnkeyError ? "Turnkey login configuration failed to initialize." : null)}
      onEmailSubmit={onEmailSubmit}
      onGoogleLogin={() => runTurnkeyFlow(() => handleGoogleOauth({ openInPage: false }))}
      onTwitterLogin={() => runTurnkeyFlow(() => handleXOauth({ openInPage: false }))}
      onPasskeyLogin={() => onError("Passkey login is disabled while OAuth login is being verified.")}
      onWalletLogin={() => onError("Wallet login is disabled while OAuth login is being verified.")}
    />
  );
}
