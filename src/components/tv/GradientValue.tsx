// 渐变 3D 数值(视觉设计 §3,审查后修订):真实 DOM 文本(E2E getByText 不受影响),
// 纯 .value-3d 类着色 —— 立体感/发光靠 CSS filter 链,不再需要 data-text 挤出副本。
export default function GradientValue({ value }: { value: string }) {
  return <span className="value-3d">{value}</span>;
}
