import clsx from "clsx";
import styles from "./Icon.module.scss";

import plusSvg from "../../../assets/icons/plus.svg?raw";
import xSvg from "../../../assets/icons/x.svg?raw";
import logoutSvg from "../../../assets/icons/log-out.svg?raw";
import refreshCwSvg from "../../../assets/icons/refresh-cw.svg?raw";
import editSvg from "../../../assets/icons/pencil-fill.svg?raw";
import deleteSvg from "../../../assets/icons/trash-fill.svg?raw";
import peopleFillSvg from "../../../assets/icons/people-fill.svg?raw";
import buildingsFillSvg from "../../../assets/icons/buildings-fill.svg?raw";
import briefcaseFillSvg from "../../../assets/icons/briefcase-fill.svg?raw";
import lockSvg from "../../../assets/icons/lock.svg?raw";
import pieChartFillSvg from "../../../assets/icons/pie-chart-fill.svg?raw";
import gearSvg from "../../../assets/icons/gear.svg?raw";
import infoSvg from "../../../assets/icons/info.svg?raw";
import arrowRightSvg from "../../../assets/icons/arrow-right.svg?raw";

const ICONS = {
  plus: plusSvg,
  x: xSvg,
  edit: editSvg,
  trash: deleteSvg,
  logout: logoutSvg,
  refresh: refreshCwSvg,
  users: peopleFillSvg,
  companies: buildingsFillSvg,
  deals: briefcaseFillSvg,
  lock: lockSvg,
  dashboards: pieChartFillSvg,
  settings: gearSvg,
  details: infoSvg,
  arrowRight: arrowRightSvg,
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
