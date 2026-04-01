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

const toneStyles: Record<StatusTone, StatusToneStyles> = {
    success: {
        container: "border-success/30 bg-success/10",
        iconWrapper: "border-success/30 bg-success/10",
        heroIconWrapper: "border-success/30 bg-success/10",
        icon: "text-success",
    },
    error: {
        container: "border-destructive/30 bg-destructive/5",
        iconWrapper: "border-destructive/30 bg-destructive/10",
        heroIconWrapper: "border-destructive/30 bg-destructive/10",
        icon: "text-destructive",
    },
    warning: {
        container: "border-warning/30 bg-warning/10",
        iconWrapper: "border-warning/30 bg-warning/10",
        heroIconWrapper: "border-warning/30 bg-warning/10",
        icon: "text-warning-dark dark:text-warning",
    },
    info: {
        container: "border-primary/20 bg-primary/5",
        iconWrapper: "border-primary/20 bg-primary/10",
        heroIconWrapper: "border-primary/20 bg-primary/10",
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
            className={cx("rounded-2xl border px-4 py-3 shadow-sm", styles.container, className)}
            {...props}
        >
            <div className="flex items-start gap-3">
                <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", styles.iconWrapper)}>
                    <Icon className={cx("h-5 w-5", styles.icon, iconClassName)} />
                </div>
                <div className="min-w-0 space-y-1.5">
                    {title && <div className="text-sm font-semibold tracking-tight text-foreground">{title}</div>}
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
            <div className={cx("mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border shadow-sm", styles.heroIconWrapper)}>
                <Icon className={cx("h-7 w-7", styles.icon, iconClassName)} />
            </div>
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
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
