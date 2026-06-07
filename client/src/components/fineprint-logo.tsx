// The Fineprint mark: an italic F with a pen-nib flick — the artwork from
// design, background stripped and fills set to currentColor so it follows
// the theme everywhere it lands.

import type { SVGProps } from "react";

export function FineprintLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="90 140 300 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M123.529 344.234C98.3785 351.959 167.184 272.314 167.184 272.314C167.184 272.314 206.88 261.683 197.619 298.78C188.358 335.878 148.68 336.508 123.529 344.234Z"
        fill="currentColor"
      />
      <path
        d="M166.443 273.592L274.301 156.768L305.16 185.259L197.302 302.083L166.443 273.592Z"
        fill="currentColor"
      />
      <path
        d="M270.878 163C270.878 159.134 274.012 156 277.878 156H374.878C378.744 156 381.878 159.134 381.878 163V181C381.878 184.866 378.744 188 374.878 188H277.878C274.012 188 270.878 184.866 270.878 181V163Z"
        fill="currentColor"
      />
      <path
        d="M233.878 220C233.878 216.134 237.012 213 240.878 213H337.878C341.744 213 344.878 216.134 344.878 220V238C344.878 241.866 341.744 245 337.878 245H240.878C237.012 245 233.878 241.866 233.878 238V220Z"
        fill="currentColor"
      />
    </svg>
  );
}
