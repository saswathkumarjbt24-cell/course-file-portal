import { departmentVisionMission, institution, institutionVisionMission } from '../data/mockData'
import './Documents.css'

function MissionList({ missions }) {
  return (
    <ul className="doc-list">
      {missions.map((text, index) => (
        <li className="doc-list__item" key={text}>
          <span className="doc-list__code">M{index + 1}</span>
          <span className="doc-list__text">{text}</span>
        </li>
      ))}
    </ul>
  )
}

export default function VisionMission({ embedded = false }) {
  return (
    <section className="doc-card">
      <article className="doc-sheet">
        <header className="doc-head">
          <h1 className="doc-head__name">{institution.name}</h1>
          <p className="doc-head__line">
            {institution.place} — Department of {departmentVisionMission.department}
          </p>
        </header>

        <h2 className="doc-subtitle">VISION AND MISSION</h2>

        <div className="doc-section">
          <h3 className="doc-section__title">Vision of the Institute</h3>
          <p className="doc-statement">{institutionVisionMission.vision}</p>
        </div>

        <div className="doc-section">
          <h3 className="doc-section__title">Mission of the Institute</h3>
          <MissionList missions={institutionVisionMission.missions} />
        </div>

        <div className="doc-section">
          <h3 className="doc-section__title">
            Vision of the Department of {departmentVisionMission.department}
          </h3>
          <p className="doc-statement">{departmentVisionMission.vision}</p>
        </div>

        <div className="doc-section">
          <h3 className="doc-section__title">Mission of the Department</h3>
          <MissionList missions={departmentVisionMission.missions} />
        </div>

        <div className="doc-sign">
          <div className="doc-sign__block">
            <div className="doc-sign__line">Course Faculty</div>
          </div>
          <div className="doc-sign__block">
            <div className="doc-sign__line">HOD</div>
          </div>
        </div>
      </article>

      {!embedded && (
        <div className="doc-actions">
          <button type="button" className="doc-button" onClick={() => window.print()}>
            Print
          </button>
          <span className="doc-status">Printing drops the navigation and buttons.</span>
        </div>
      )}
    </section>
  )
}
