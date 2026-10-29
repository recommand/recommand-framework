import type { ElementType, HTMLAttributes, ReactNode } from "react";

type StatusTone = "success" | "error" | "warning" | "info";

type StatusToneStyles = {
    container: string;
    iconWrapper: string;
    heroIconWrapper: string;
    icon: string;
};

type SharedStatusProps = {
    tone: StatusTone;
    icon: ElementType<{ className?: string }>;
    iconClassName?: string;
};

type StatusMessageProps = HTMLAttributes<HTMLDivElement> & SharedStatusProps & {
    title?: ReactNode;
    description?: ReactNode;
};

type StatusHeroProps = HTMLAttributes<HTMLDivElement> & SharedStatusProps & {
    title: ReactNode;
    description?: ReactNode;
};

// Colours come from the theme contract that core defines (see core's
// THEMING.md). A failure is shown like a warning: red is kept for
// destructive actions, not for status.
const toneStyles: Record<StatusTone, StatusToneStyles> = {
    success: {
        container: "border-success-line bg-success-soft",
        iconWrapper: "border-success-line bg-background",
        heroIconWrapper: "border-success-line bg-success-soft",
        icon: "text-success",
    },
    error: {
        container: "border-warning-line bg-warning-soft",
        iconWrapper: "border-warning-line bg-background",
        heroIconWrapper: "border-warning-line bg-warning-soft",
        icon: "text-warning-foreground",
    },
    warning: {
        container: "border-warning-line bg-warning-soft",
        iconWrapper: "border-warning-line bg-background",
        heroIconWrapper: "border-warning-line bg-warning-soft",
        icon: "text-warning-foreground",
    },
    info: {
        container: "border-info-line bg-info-soft",
        iconWrapper: "border-info-line bg-background",
        heroIconWrapper: "border-info-line bg-info-soft",
        icon: "text-primary",
    },
};

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export function StatusMessage({
    tone,
    icon: Icon,
    title,
    description,
    children,
    className,
    iconClassName,
    ...props
}: StatusMessageProps) {
    const styles = toneStyles[tone];

    return (
        <div
            role={tone === "error" || tone === "warning" ? "alert" : "status"}
            aria-live={tone === "error" || tone === "warning" ? "assertive" : "polite"}
            className={cx("rounded-xl border p-4", styles.container, className)}
            {...props}
        >
            <div className="flex items-start gap-3">
                <div className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg border", styles.iconWrapper)}>
                    <Icon className={cx("size-4.5", styles.icon, iconClassName)} />
                </div>
                <div className="min-w-0 space-y-1.5">
                    {title && <div className="text-sm font-title text-foreground">{title}</div>}
                    {description && <div className="text-sm text-pretty text-muted-foreground">{description}</div>}
                    {children}
                </div>
            </div>
        </div>
    );
}

export function StatusHero({
    tone,
    icon: Icon,
    title,
    description,
    children,
    className,
    iconClassName,
    ...props
}: StatusHeroProps) {
    const styles = toneStyles[tone];

    return (
        <div
            role={tone === "error" || tone === "warning" ? "alert" : "status"}
            aria-live={tone === "error" || tone === "warning" ? "assertive" : "polite"}
            className={cx("space-y-4 text-center", className)}
            {...props}
        >
            <div className={cx("mx-auto flex size-14 items-center justify-center rounded-xl border", styles.heroIconWrapper)}>
                <Icon className={cx("size-7", styles.icon, iconClassName)} />
            </div>
            <div className="space-y-2">
                <h1 className="text-page-title text-foreground">{title}</h1>
                {description && (
                    <div className="mx-auto max-w-sm text-sm text-balance text-muted-foreground">
                        {description}
                    </div>
                )}
            </div>
            {children}
        </div>
    );
}
