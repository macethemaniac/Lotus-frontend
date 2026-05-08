import React from 'react';
import { BrandAsset, AssetType } from '../types';
import { LotusLogo, LotusWordmark, DownloadIcon } from './Icons';

const AssetCard: React.FC<{ asset: BrandAsset }> = ({ asset }) => {
  return (
    <div className="flex flex-col border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/20 hover:bg-zinc-900/40 transition-colors group">
      <div className={`
        h-48 flex items-center justify-center p-8 relative
        ${asset.dark ? 'bg-black' : 'bg-white'}
      `}>
         {/* Checkerboard pattern for transparency indication if needed, though simpler is better here */}
        {asset.preview}
      </div>
      
      <div className="p-6 flex flex-col flex-1 border-t border-zinc-800">
        <h4 className="text-white font-bold mb-1">{asset.title}</h4>
        <p className="text-zinc-400 text-sm mb-4 flex-1">{asset.description}</p>
        
        <div className="flex flex-wrap gap-2 mt-auto">
          {asset.downloads.map((dl, idx) => (
            <button 
              key={idx}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 hover:text-white transition-all"
            >
              <DownloadIcon className="w-3 h-3" />
              <span>{dl.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const LogoGrid: React.FC = () => {
  const assets: BrandAsset[] = [
    {
      title: "Wordmark (Dark Mode)",
      description: "Primary logo for dark backgrounds. This is the default usage for the application.",
      dark: true,
      preview: <LotusWordmark className="text-white" />,
      downloads: [{ type: AssetType.SVG, url: '#' }, { type: AssetType.PNG, url: '#' }]
    },
    {
      title: "Wordmark (Light Mode)",
      description: "Secondary logo for light backgrounds, documents, and press releases.",
      dark: false,
      preview: <LotusWordmark className="text-black" />,
      downloads: [{ type: AssetType.SVG, url: '#' }, { type: AssetType.PNG, url: '#' }]
    },
    {
      title: "Logomark",
      description: "The geometric Lotus symbol. Use for favicons, avatars, or where space is limited.",
      dark: true,
      preview: <LotusLogo className="w-20 h-20 text-lotus-500" />,
      downloads: [{ type: AssetType.SVG, url: '#' }, { type: AssetType.PNG, url: '#' }]
    },
    {
      title: "Monochrome",
      description: "Single color version for printing or restricted color environments.",
      dark: true,
      preview: <LotusWordmark className="text-zinc-500" />,
      downloads: [{ type: AssetType.SVG, url: '#' }]
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {assets.map((asset, i) => <AssetCard key={i} asset={asset} />)}
    </div>
  );
};