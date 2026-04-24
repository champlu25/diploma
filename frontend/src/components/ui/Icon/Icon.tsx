import clsx from "clsx";
import styles from "./Icon.module.scss";

import plusSvg from "../../../assets/icons/plus.svg?raw";
import xSvg from "../../../assets/icons/x.svg?raw";
import searchSvg from "../../../assets/icons/search.svg?raw";
import logoutSvg from "../../../assets/icons/log-out.svg?raw";
import refreshCwSvg from "../../../assets/icons/refresh-cw.svg?raw";
import editSvg from "../../../assets/icons/pencil-fill.svg?raw";
import deleteSvg from "../../../assets/icons/trash-fill.svg?raw";
import peopleFillSvg from "../../../assets/icons/people-fill.svg?raw";
import buildingsFillSvg from "../../../assets/icons/buildings-fill.svg?raw";
import houseFillSvg from "../../../assets/icons/house-fill.svg?raw";

const ICONS = {
  plus: plusSvg,
  x: xSvg,
  search: searchSvg,
  edit: editSvg,
  trash: deleteSvg,
  logout: logoutSvg,
  refresh: refreshCwSvg,
  users: peopleFillSvg,
  companies: buildingsFillSvg,
  home: houseFillSvg,
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  title?: string;
  className?: string;
}

export function Icon({ name, size = 20, title, className }: IconProps) {
  const markup = ICONS[name];

  return (
    <span
      className={clsx(styles.icon, className)}
      style={{ ["--size" as never]: `${size}px` }}
      aria-hidden={title ? undefined : true}
      title={title}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
