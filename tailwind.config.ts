import type { Config } from "tailwindcss";

// Colors, spacing, radius and shadows are sourced from design-system/tokens.json.
// Keep this file in sync if the design system is updated.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#006B3F",
          primaryDark: "#004F32",
          primaryLight: "#14915B",
          50: "#F3FAF6",
          100: "#E5F3EB",
          200: "#B9DFC9",
          300: "#82C7A5",
          400: "#48AD7D",
          500: "#14915B",
          600: "#087A4A",
          700: "#006B3F",
          800: "#005D39",
          900: "#004F32",
          950: "#003D25",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          soft: "#F8F9F8",
          green: "#F3FAF6",
        },
        ink: {
          primary: "#252B27",
          secondary: "#626A65",
          muted: "#7B837E",
          inverse: "#FFFFFF",
        },
        border: {
          DEFAULT: "#E5E8E6",
        },
        status: {
          success: "#168653",
          warning: "#D69A24",
          danger: "#C94343",
          info: "#3478A8",
        },
      },
      fontFamily: {
        display: ["var(--font-montserrat)", "Montserrat", "sans-serif"],
        body: ["var(--font-inter)", "Inter", "sans-serif"],
      },
      fontSize: {
        base: "15px",
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "14px",
        xl: "20px",
      },
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        10: "40px",
        12: "48px",
        16: "64px",
        20: "80px",
        24: "96px",
      },
      boxShadow: {
        sm: "0 2px 8px rgba(0,0,0,.06)",
        md: "0 8px 24px rgba(0,0,0,.08)",
      },
      maxWidth: {
        content: "1280px",
      },
    },
  },
  plugins: [],
};

export default config;
