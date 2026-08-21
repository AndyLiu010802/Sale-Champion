// 渐变 3D 数值(视觉设计 §3,审查后修订):真实 DOM 文本(E2E getByText 不受影响),
// 纯 .value-3d 类着色 —— 立体感/发光靠 CSS filter 链,不再需要 data-text 挤出副本。
//
// gradient 可选(2026-08-21):目标环按目标换色,把三段色与外发光写成 CSS 变量交给
// .value-3d。不传就吃类里的默认值,榜单与记分卡的调用点因此一个字都不用改。

import type { GoalGradient } from '@/lib/goals/palette';

export default function GradientValue({
  value,
  gradient,
}: {
  value: string;
  gradient?: GoalGradient;
}) {
  const style = gradient
    ? ({
        '--gv-a': gradient.stops[0],
        '--gv-b': gradient.stops[1],
        '--gv-c': gradient.stops[2],
        '--gv-glow': gradient.glow,
      } as React.CSSProperties)
    : undefined;
  return <span className="value-3d" style={style}>{value}</span>;
}
