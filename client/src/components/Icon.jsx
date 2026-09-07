const paths = {
  briefcase:
    "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 7h18v13H3zM3 11c5 4 13 4 18 0M10 13h4",
  folder: "M3 5h6l2 2h10v13H3z",
  calendar: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 18h2",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  connect:
    "M9 15l6-6M8 17l-2 2a4 4 0 0 1-5-5l4-4a4 4 0 0 1 5 0M16 7l2-2a4 4 0 0 1 5 5l-4 4a4 4 0 0 1-5 0",
  chart: "M4 3v17h17M8 15v-4M13 15V7M18 15V4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M14 7l5 5-5 5",
  close: "M6 6l12 12M6 18L18 6",
  file: "M5 3h9l5 5v13H5zM14 3v6h5M9 13h6M9 17h6",
  upload: "M12 16V3M7 8l5-5 5 5M4 15v6h16v-6",
  check: "M5 12l4 4L19 6",
  external: "M14 3h7v7M21 3L10 14M10 3H3v18h18v-7",
};
export default function Icon({ name, ...props }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.file} />
    </svg>
  );
}
