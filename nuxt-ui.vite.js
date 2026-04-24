/**
 * Options for `@nuxt/ui/vite` (see vite.config.js plugins).
 * light/dark mode is handled elsewhere in the app itself; Nuxt UI would otherwise override it.
 */
export default {
    colorMode: false,
    ui: {
        button: {
            slots: {
                base: "font-semibold cursor-pointer",
            },
            variants: {
                size: {
                    "2xl": {
                        base: "p-2 text-lg gap-2.5",
                        leadingIcon: "size-8",
                        leadingAvatarSize: "md",
                        trailingIcon: "size-8",
                    },
                },
            },
            defaultVariants: {
                size: "sm",
            },
        },
        tooltip: {
            slots: {
                content: "ring-2 ring-primary max-w-sm lg:max-w-lg h-fit z-99999", // not good, temporary z-index override to fix other extremely high values interfering
                arrow: "fill-primary",
                text: "whitespace-normal",
            },
        },
        switch: {
            slots: {
                base: "cursor-pointer",
                thumb: "bg-white",
            },
            defaultVariants: {
                size: "sm",
            },
        },
        select: {
            slots: {
                base: "cursor-pointer",
                item: "cursor-pointer",
                content: "z-99999",
            },
            defaultVariants: {
                size: "sm",
            },
        },
        selectMenu: {
            slots: {
                base: "cursor-pointer",
                item: "cursor-pointer",
                content: "z-99999",
            },
            defaultVariants: {
                size: "sm",
            },
        },
        input: {
            defaultVariants: {
                size: "sm",
            },
        },
        inputNumber: {
            slots: {
                root: "min-w-12 w-28",
                base: "appearance-none",
            },
            defaultVariants: {
                size: "sm",
            },
        },
        colors: {
            primary: "primary",
            neutral: "neutral",
            success: "lime",
            warning: "orange",
        },
    },
};
