// 渐变 3D 数值(视觉设计 §3):真实 DOM 文本(E2E getByText 不受影响)+ data-text
// 供 .value-3d::before 画深色挤出副本。计划定稿组件方案而非裸类:数值都是格式化
// 表达式,组件让 children 与 data-text 只写一遍、永不脱节。无 hooks,无需 'use client'。
export default function GradientValue({ value }: { value: string }) {
  return (
    <span className="value-3d" data-text={value}>
      {value}
    </span>
  );
}
