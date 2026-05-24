import { OtpType } from "@turnkey/core";
import { ClientState, useTurnkey } from "@turnkey/react-wallet-kit";
import { useState } from "react";
import { assertTurnkeyConfigured } from "@/features/auth/api/turnkey-auth";
import { AuthPageMockup } from "@/design/mockups/AuthPageMockup";

export function TurnkeyAuthScreen({
  loading,
  error,
  onError,
}: {
  loading: boolean;
  error: string | null;
  onError: (message: string) => void;
}) {
  const { clientState, handleGoogleOauth, handleXOauth, initOtp, completeOtp } = useTurnkey();
  const [emailOtpRequest, setEmailOtpRequest] = useState<{
    email: string;
    otpId: string;
    otpEncryptionTargetBundle: string;
  } | null>(null);
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
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

  const handleEmailSubmit = async (email: string) => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;

    setEmailAuthLoading(true);
    await runTurnkeyFlow(async () => {
      const { otpId, otpEncryptionTargetBundle } = await initOtp({
        otpType: OtpType.Email,
        contact: normalizedEmail,
      });
      setEmailOtpRequest({
        email: normalizedEmail,
        otpId,
        otpEncryptionTargetBundle,
      });
    });
    setEmailAuthLoading(false);
  };

  const handleEmailOtpSubmit = async (otpCode: string) => {
    if (!emailOtpRequest) return;

    const normalizedOtpCode = otpCode.trim();
    if (!normalizedOtpCode) return;

    setEmailAuthLoading(true);
    await runTurnkeyFlow(async () => {
      await completeOtp({
        otpType: OtpType.Email,
        contact: emailOtpRequest.email,
        otpId: emailOtpRequest.otpId,
        otpEncryptionTargetBundle: emailOtpRequest.otpEncryptionTargetBundle,
        otpCode: normalizedOtpCode,
      });
      setEmailOtpRequest(null);
    });
    setEmailAuthLoading(false);
  };

  return (
    <AuthPageMockup
      loading={loading || emailAuthLoading || !turnkeyReady}
      error={error ?? (turnkeyError ? "Turnkey login configuration failed to initialize." : null)}
      onEmailSubmit={handleEmailSubmit}
      emailOtpContact={emailOtpRequest?.email ?? null}
      onEmailOtpSubmit={handleEmailOtpSubmit}
      onEmailOtpCancel={() => setEmailOtpRequest(null)}
      onGoogleLogin={() => runTurnkeyFlow(() => handleGoogleOauth({ openInPage: true }))}
      onTwitterLogin={() => runTurnkeyFlow(() => handleXOauth({ openInPage: true }))}
    />
  );
}
