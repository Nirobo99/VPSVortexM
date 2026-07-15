export function AnimatedBackground() {
  return (
    <div className="animated-bg" aria-hidden>
      <div className="animated-bg__shimmer" />
      <div className="animated-bg__blob animated-bg__blob--1" />
      <div className="animated-bg__blob animated-bg__blob--2" />
      <div className="animated-bg__blob animated-bg__blob--3" />
    </div>
  );
}
