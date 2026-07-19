import { forwardRef, useRef } from 'react';
import { cn } from '../../utils/cn';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm border border-transparent',
    secondary: 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 shadow-sm',
    danger: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 shadow-sm',
    dangerSolid: 'bg-red-600 text-white hover:bg-red-700 shadow-sm border border-transparent',
    outline: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    soft: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-transparent',
};

const sizes = {
    'icon-xs': 'p-1',
    'icon-sm': 'p-1.5',
    'icon-md': 'p-2',
    xs: 'px-2.5 py-1 text-xs',
    sm: 'px-4 py-1.5 text-sm',
    md: 'px-5 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
};

const Button = forwardRef(({
    variant = 'primary',
    size = 'md',
    isLoading = false,
    loadingText,
    iconLeft,
    iconRight,
    className,
    disabled,
    children,
    onClick,
    type = 'button',
    ...props
}, forwardedRef) => {
    const internalRef = useRef(null);
    
    // Use forwarded ref if provided, otherwise internal ref
    const ref = (node) => {
        internalRef.current = node;
        if (typeof forwardedRef === 'function') {
            forwardedRef(node);
        } else if (forwardedRef) {
            forwardedRef.current = node;
        }
    };

    useGSAP(() => {
        if (!internalRef.current) return;
        const btn = internalRef.current;
        
        const handleMouseDown = () => {
            if (disabled || isLoading) return;
            gsap.to(btn, { scale: 0.95, duration: 0.1, ease: 'power2.out' });
        };
        
        const handleMouseUp = () => {
            gsap.to(btn, { scale: 1, duration: 0.3, ease: 'back.out(1.5)' });
        };
        
        const handleMouseLeave = () => {
            gsap.to(btn, { scale: 1, duration: 0.3, ease: 'power2.out' });
        };

        btn.addEventListener('mousedown', handleMouseDown);
        btn.addEventListener('mouseup', handleMouseUp);
        btn.addEventListener('mouseleave', handleMouseLeave);
        btn.addEventListener('touchstart', handleMouseDown, { passive: true });
        btn.addEventListener('touchend', handleMouseUp);
        
        return () => {
            btn.removeEventListener('mousedown', handleMouseDown);
            btn.removeEventListener('mouseup', handleMouseUp);
            btn.removeEventListener('mouseleave', handleMouseLeave);
            btn.removeEventListener('touchstart', handleMouseDown);
            btn.removeEventListener('touchend', handleMouseUp);
        };
    }, [disabled, isLoading]);

    const baseStyles = 'font-bold rounded-lg flex items-center justify-center gap-2 transition-colors focus:outline-none select-none';
    const variantStyles = variants[variant] || variants.primary;
    const sizeStyles = sizes[size] || sizes.md;
    
    const isDisabled = disabled || isLoading;
    const disabledStyles = isDisabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer';

    return (
        <button
            ref={ref}
            type={type}
            disabled={isDisabled}
            onClick={onClick}
            className={cn(baseStyles, variantStyles, sizeStyles, disabledStyles, className)}
            {...props}
        >
            {isLoading ? (
                <>
                    <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    {(loadingText || children) && <span>{loadingText || children}</span>}
                </>
            ) : (
                <>
                    {iconLeft && <span className="shrink-0">{iconLeft}</span>}
                    {children && <span>{children}</span>}
                    {iconRight && <span className="shrink-0">{iconRight}</span>}
                </>
            )}
        </button>
    );
});

Button.displayName = 'Button';

export default Button;
