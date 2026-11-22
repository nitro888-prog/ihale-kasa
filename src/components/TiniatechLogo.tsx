import React, { useState } from 'react';

export const TINIATECH_LOGO_SRC = '/assets/aistudio/g_ncel_TINIATECH__S_ML__817f9f87.png';

export type TiniatechLogoVariant = 'sidebar' | 'plaque' | 'hero' | 'compact' | 'inline';

interface TiniatechLogoProps {
  variant?: TiniatechLogoVariant;
  subtitle?: string;
  className?: string;
}

const FallbackCastleMark: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <polygon
      points="32,3 58,18 58,46 32,61 6,46 6,18"
      fill="#FFFFFF"
      stroke="#002060"
      strokeWidth="3.5"
    />
    <polygon points="32,8 10,20.5 10,41 32,29" fill="#00AEEF" />
    <polygon points="32,8 54,20.5 54,41 32,29" fill="#007A53" />
    <circle cx="32" cy="27" r="4.5" fill="#FFFFFF" />
    <path
      d="M25 51V39H23V35H26V37H29V35H35V37H38V35H41V39H39V51H25Z"
      fill="#002060"
    />
  </svg>
);

export const TiniatechLogo: React.FC<TiniatechLogoProps> = ({
  variant = 'plaque',
  subtitle,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const logoVisual = imgError ? (
    <div className="inline-flex items-center gap-2">
      <FallbackCastleMark className="w-8 h-8 shrink-0" />
      <span className="font-display font-extrabold tracking-wide text-[#002060] text-sm">
        TINIATECH®
      </span>
    </div>
  ) : (
    <img
      src={TINIATECH_LOGO_SRC}
      alt="Tiniatech Kurumsal Logo"
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      className={
        variant === 'hero'
          ? 'h-14 sm:h-16 w-auto max-w-full object-contain select-none'
          : variant === 'sidebar'
          ? 'h-11 w-auto max-w-[180px] object-contain select-none'
          : variant === 'compact'
          ? 'h-8 w-auto max-w-[132px] object-contain select-none'
          : variant === 'inline'
          ? 'h-9 w-auto max-w-[148px] object-contain select-none'
          : 'h-10 w-auto max-w-[164px] object-contain select-none'
      }
    />
  );

  if (variant === 'inline') {
    return (
      <div className={`inline-flex items-center gap-2.5 ${className}`}>
        {logoVisual}
        {subtitle && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4E5D6C] border-l border-[#DCE3EC] pl-2.5 whitespace-nowrap">
            {subtitle}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <div className={`flex flex-col items-start gap-1 ${className}`}>
        {logoVisual}
        {subtitle && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4E5D6C] leading-none">
            {subtitle}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center justify-center bg-white border border-[#DCE3EC] rounded-lg px-2.5 py-1 shadow-2xs shrink-0 ${className}`}
      >
        {logoVisual}
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div
        className={`inline-flex flex-col sm:flex-row sm:items-center gap-3 bg-white border border-[#DCE3EC] rounded-xl px-4 py-2.5 shadow-2xs ${className}`}
      >
        {logoVisual}
        {subtitle && (
          <div className="sm:border-l sm:border-[#DCE3EC] sm:pl-3 text-left">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0B2239]">
              {subtitle}
            </div>
            <div className="text-[11px] text-[#4E5D6C]">Kurumsal İşletme Portalı</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-3 bg-white border border-[#DCE3EC] rounded-lg px-3.5 py-2 shadow-2xs shrink-0 ${className}`}
    >
      {logoVisual}
      {subtitle && (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4E5D6C] border-l border-[#DCE3EC] pl-2.5 whitespace-nowrap">
          {subtitle}
        </span>
      )}
    </div>
  );
};
