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
            compoundVariants: [
                {
                    color: "primary",
                    variant: "solid",
                    // Primary is yellow (#ffbb00); Nuxt UI defaults text-inverted to #fff in light
                    // mode. Override with black text for both light and dark modes — yellow always
                    // needs dark text regardless of theme. disabled:!text-toned restores the muted
                    // disabled appearance which !text-black would otherwise override.
                    class: "!text-black disabled:bg-accented disabled:!text-toned",
                },
            ],
            defaultVariants: {
                size: "sm",
            },
        },
        tooltip: {
            slots: {
                // z-[2500]: slot overrides replace the full class string, dropping Nuxt UI's default
                // z-50. Without an explicit z-index, tooltips render behind the sticky header (z-10)
                // due to the stacking context created by #main-wrapper's transform:scale(). 2500
                // clears all app dialogs (z-1000–2001) and the ConnectButton dropdown (z-2100).
                content: "ring-2 ring-primary max-w-sm lg:max-w-lg h-fit z-[2500]",
                arrow: "fill-primary stroke-primary",
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
                // data-[state=checked] is set by Reka UI on the selected item; itemTrailingIcon
                // only renders inside SelectItemIndicator so colouring it never affects other icons.
                item: "cursor-pointer data-[state=checked]:before:bg-primary/15 data-[state=checked]:text-highlighted data-[state=checked]:font-medium data-[state=checked]:data-highlighted:before:bg-primary/25",
                itemTrailingIcon: "text-primary-700 dark:text-primary",
            },
            defaultVariants: {
                size: "sm",
            },
        },
        selectMenu: {
            slots: {
                base: "cursor-pointer",
                item: "cursor-pointer data-[state=checked]:before:bg-primary/15 data-[state=checked]:text-highlighted data-[state=checked]:font-medium data-[state=checked]:data-highlighted:before:bg-primary/25",
                itemTrailingIcon: "text-primary-700 dark:text-primary",
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
