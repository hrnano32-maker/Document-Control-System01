import React from 'react';

export const NanoLogo: React.FC<{
  className?: string;
}> = ({ className = 'h-7 w-auto' }) => {
  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 250 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full max-h-full"
        style={{ aspectRatio: '250 / 120' }}
      >
        {/* Outer Red Oval Contour with Left-Side Taper */}
        <path
          d="M 5 60 C 5 40, 48 5, 145 5 C 215 5, 246 28, 246 60 C 246 92, 212 115, 145 115 C 50 115, 5 80, 5 60 Z"
          stroke="#FF0000"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Inner Left Loop Curve (as in original NANO brand identity) */}
        <path
          d="M 6 60 C 20 40, 60 38, 90 42 C 103 44, 105 60, 96 72 C 80 84, 30 82, 6 60 Z"
          stroke="#FF0000"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* NANO Serif Lettering in True Red */}
        <text
          x="166"
          y="70"
          textAnchor="middle"
          fill="#FF0000"
          fontSize="41"
          fontWeight="bold"
          fontFamily="'Times New Roman', 'Georgia', 'Playfair Display', serif"
          letterSpacing="1.5"
        >
          NANO
        </text>
      </svg>
    </div>
  );
};
