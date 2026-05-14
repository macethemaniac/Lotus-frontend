import { useMemo } from "react";
import { TurnkeyProvider, type TurnkeyCallbacks, type TurnkeyProviderConfig } from "@turnkey/react-wallet-kit";
import { env } from "@/config/env";

export function isTurnkeyProviderConfigured(): boolean {
  return Boolean(env.turnkeyAuthEnabled && env.turnkeyOrganizationId && env.turnkeyAuthProxyConfigId);
}

export function LotusTurnkeyProvider({
  children,
  onAuthenticationSuccess,
  onError,
}: {
  children: React.ReactNode;
  onAuthenticationSuccess: TurnkeyCallbacks["onAuthenticationSuccess"];
  onError: TurnkeyCallbacks["onError"];
}) {
  if (!isTurnkeyProviderConfigured()) {
    return <>{children}</>;
  }

  const config: TurnkeyProviderConfig = useMemo(
    () => ({
      apiBaseUrl: "https://api.turnkey.com",
      authProxyUrl: env.turnkeyAuthProxyUrl,
      organizationId: env.turnkeyOrganizationId,
      authProxyConfigId: env.turnkeyAuthProxyConfigId,
      auth: {
        autoRefreshSession: true,
        oauthConfig: {
          oauthRedirectUri: env.turnkeyOauthRedirectUri || window.location.origin,
          openOauthInPage: true,
        },
      },
      autoRefreshManagedState: true,
      autoFetchWalletKitConfig: true,
      ui: {
        darkMode: true,
        preferLargeActionButtons: true,
        borderRadius: 12,
        supressMissingStylesError: true,
        authModal: {
          methodOrder: ["socials", "email"],
          oauthOrder: ["google", "x"],
          methods: {
            passkeyAuthEnabled: false,
            walletAuthEnabled: false,
            smsOtpAuthEnabled: false,
            appleOauthEnabled: false,
            discordOauthEnabled: false,
            facebookOauthEnabled: false,
          },
        },
      },
    }),
    [],
  );

  return (
    <TurnkeyProvider
      config={config}
      callbacks={{
        onAuthenticationSuccess,
        onError,
      }}
    >
      {children}
    </TurnkeyProvider>
  );
}
