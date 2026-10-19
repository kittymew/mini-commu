import { Link } from 'react-router'

export function PlaceholderPage({ title, description, step }: { title: string; description: string; step: string }) {
  return <section className="card placeholder">
    <span className="eyebrow">준비 중 · {step}</span>
    <h1>{title}</h1><p>{description}</p>
    <p className="muted">현재는 페이지 이동을 확인할 수 있는 기본 화면입니다. 아직 데이터를 조회하거나 저장하지 않습니다.</p>
    <Link className="button" to="/">시작 화면으로</Link>
  </section>
}
