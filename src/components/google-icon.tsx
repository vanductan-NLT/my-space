import React from 'react'

export interface GoogleIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string
  size?: number
  fill?: boolean
  weight?: 300 | 400 | 500
  className?: string
}

export function GoogleIcon({
  name,
  size = 20,
  fill = false,
  weight = 400,
  className = '',
  style,
  ...rest
}: GoogleIconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${Math.min(Math.max(size, 20), 24)}`,
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    >
      {name}
    </span>
  )
}
