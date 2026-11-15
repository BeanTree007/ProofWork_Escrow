export default function PageHeader({ title, lede, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  );
}
