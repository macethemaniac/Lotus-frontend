import React from 'react';

type LogoKind = 'asset' | 'chain' | 'venue';

type AssetLogoProps = {
  id: string;
  label?: string;
  kind?: LogoKind;
  className?: string;
};

const cryptoLogos: Record<string, string> = {
  abstract: '/assets/logos/crypto/abstract.jpeg',
  arbitrum: '/assets/logos/crypto/arbitrum.svg',
  arb: '/assets/logos/crypto/arbitrum.svg',
  base: '/assets/logos/crypto/base.jpeg',
  bitcoin: '/assets/logos/crypto/bitcoin.svg',
  btc: '/assets/logos/crypto/bitcoin.svg',
  bnb: '/assets/logos/crypto/bnb.svg',
  bsc: '/assets/logos/crypto/bnb.svg',
  'bnb smart chain': '/assets/logos/crypto/bnb.svg',
  eth: '/assets/logos/crypto/eth.svg',
  ethereum: '/assets/logos/crypto/eth.svg',
  weth: '/assets/logos/crypto/eth.svg',
  monad: '/assets/logos/crypto/monad.jpeg',
  optimism: '/assets/logos/crypto/optimism.svg',
  op: '/assets/logos/crypto/optimism.svg',
  polygon: '/assets/logos/crypto/polygon.svg',
  matic: '/assets/logos/crypto/polygon.svg',
  sol: '/assets/logos/crypto/sol.svg',
  solana: '/assets/logos/crypto/sol.svg',
  usdc: '/assets/logos/crypto/usdc.svg',
  'usdc.e': '/assets/logos/crypto/usdc.svg',
  usdt: '/assets/logos/crypto/usdt.svg',
};

const venueLogos: Record<string, string> = {
  limitless: '/assets/logos/venues/limitless.jpg',
  myriad: '/assets/logos/venues/myriad.jpg',
  opinion: '/assets/logos/venues/opinion.jpg',
  poly: '/assets/logos/venues/polymarket.png',
  polymarket: '/assets/logos/venues/polymarket.png',
  predict: '/assets/logos/venues/predict-fun.png',
  predictfun: '/assets/logos/venues/predict-fun.png',
  'predict fun': '/assets/logos/venues/predict-fun.png',
  'predict.fun': '/assets/logos/venues/predict-fun.png',
  predictit: '/assets/logos/venues/predict-fun.png',
  'predict it': '/assets/logos/venues/predict-fun.png',
  'predict.fun market': '/assets/logos/venues/predict-fun.png',
};

const normalizeLogoId = (id: string) => id.trim().toLowerCase().replace(/_/g, ' ');

const resolveLogo = (id: string, kind: LogoKind) => {
  const key = normalizeLogoId(id);

  if (kind === 'venue') return venueLogos[key];
  return cryptoLogos[key];
};

const fallbackText = (label: string) => {
  const cleaned = label.replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.slice(0, 1).toUpperCase() || '?';
};

export const AssetLogo = ({ id, label, kind = 'asset', className = 'h-5 w-5' }: AssetLogoProps) => {
  const displayLabel = label ?? id;
  const src = resolveLogo(id, kind);

  if (src) {
    return (
      <img
        src={src}
        alt={`${displayLabel} logo`}
        className={`${className} shrink-0 rounded-full object-cover`}
        decoding="async"
        loading="lazy"
      />
    );
  }

  return (
    <span
      aria-label={`${displayLabel} logo`}
      className={`${className} flex shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-[10px] font-bold text-zinc-200`}
    >
      {fallbackText(displayLabel)}
    </span>
  );
};

export const CryptoLogo = (props: Omit<AssetLogoProps, 'kind'>) => <AssetLogo {...props} kind="asset" />;

export const ChainLogo = (props: Omit<AssetLogoProps, 'kind'>) => <AssetLogo {...props} kind="chain" />;

export const VenueLogo = (props: Omit<AssetLogoProps, 'kind'>) => <AssetLogo {...props} kind="venue" />;
