import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """Canvas that computes total pages dynamically and prints professional headers & footers."""
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#666666"))

        # Running header (pages 2+)
        if self._pageNumber > 1:
            self.drawString(54, 750, "SHODH — Criminal Network Analysis Platform (CNAP) | Technical Documentation")
            self.drawRightString(612 - 54, 750, "CONFIDENTIAL // LAW ENFORCEMENT ONLY")
            self.setStrokeColor(colors.HexColor("#E0E0E0"))
            self.setLineWidth(0.75)
            self.line(54, 744, 612 - 54, 744)

        # Running footer
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(612 - 54, 36, page_text)
        self.drawString(54, 36, "SHODH Visual Intelligence Suite | 100% Air-Gapped Local Deployment")
        self.setStrokeColor(colors.HexColor("#E0E0E0"))
        self.setLineWidth(0.75)
        self.line(54, 46, 612 - 54, 46)
        self.restoreState()


def build_pdf(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1A1A1A"),
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#B45309"),
        spaceAfter=8,
    )

    h1_style = ParagraphStyle(
        'Header1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#1A1A1A"),
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        'Header2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#1A1A1A"),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#262626"),
        spaceAfter=6,
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#333333"),
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3,
    )

    code_style = ParagraphStyle(
        'CodeStyle',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=10.5,
        textColor=colors.HexColor("#1E293B"),
    )

    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1A1A1A"),
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1A1A1A"),
    )

    story = []

    # ── Top Banner Header ──
    banner_data = [
        [
            Paragraph("<b>SHODH</b> — Criminal Network Analysis Platform (CNAP)", title_style),
        ],
        [
            Paragraph("AI-Powered Law Enforcement Visual Intelligence Suite &bull; 100% Air-Gapped Local Deployment &bull; Zero Cloud & Zero External APIs", subtitle_style),
        ],
        [
            Paragraph("<b>Operational Status:</b> Production Ready &nbsp;|&nbsp; <b>Evidence Standard:</b> Indian Evidence Act §65B Admissible &nbsp;|&nbsp; <b>Security:</b> Completely Offline", body_style),
        ]
    ]
    banner_table = Table(banner_data, colWidths=[504])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor("#D97706")),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 10))

    # ── Executive Summary ──
    story.append(Paragraph("1. Executive Summary", h1_style))
    story.append(Paragraph(
        "<b>SHODH</b> is an offline-capable visual intelligence platform engineered for state police departments, cybercrime cells, and anti-narcotics task forces to uncover, map, forecast, and dismantle multi-jurisdictional organized crime syndicates. It synthesizes heterogeneous investigative records—including Call Detail Records (CDRs), Hawala transactions, FIRs, field surveillance reports, and cell tower trails—into a coherent, interactive relationship graph.",
        body_style
    ))
    story.append(Paragraph(
        "All analytical computations, graph centrality algorithms, anomaly detectors, and time-series predictive forecasts run strictly on local hardware using <b>FastAPI, SQLite, NetworkX, ELK.js, D3.js</b>, and <b>React 19</b> without transmitting evidentiary records to any cloud vendor or third-party AI service.",
        body_style
    ))
    story.append(Spacer(1, 6))

    # ── VISUAL SYSTEM ARCHITECTURE ──
    story.append(Paragraph("2. Visual System Architecture", h1_style))
    story.append(Paragraph(
        "The architecture is organized into four distinct, air-gapped tiers ensuring courtroom evidentiary integrity, millisecond graph layouts, and strict surveillance warrant gating:",
        body_style
    ))

    arch_data = [
        [
            Paragraph("<b>TIER</b>", table_cell_bold),
            Paragraph("<b>CORE ARCHITECTURAL COMPONENTS & RESPONSIBILITIES</b>", table_cell_bold),
            Paragraph("<b>TECHNOLOGIES</b>", table_cell_bold),
        ],
        [
            Paragraph("<b>Tier 1:<br/>Presentation &<br/>Investigation</b>", table_cell),
            Paragraph(
                "&bull; <b>Dual Graph Engines:</b> ELK.js Hierarchical Link Graph (DAG) + Cytoscape Concentric Rings.<br/>"
                "&bull; <b>Analytical Views:</b> D3 Past Chronology, D3 Predictive Timeline (12 Threat Forecasts).<br/>"
                "&bull; <b>Tactical GeoIntel:</b> India-bounded Leaflet dark map with real-time radar sweep & meetups.<br/>"
                "&bull; <b>Interactive Modules:</b> AI Investigator Assistant (RAG), Hierarchy Tree, Approvals Gate.",
                table_cell
            ),
            Paragraph("React 19<br/>Vite<br/>ELK.js<br/>D3.js v7<br/>Leaflet", table_cell)
        ],
        [
            Paragraph("<b>Tier 2:<br/>Application &<br/>API Gateway</b>", table_cell),
            Paragraph(
                "&bull; <b>Auth & RBAC:</b> OAuth2 Password Flow + JWT (Investigator, Senior Authority, Admin).<br/>"
                "&bull; <b>REST API Engine:</b> Multi-case endpoints, graph exports, pattern detectors, approvals.<br/>"
                "&bull; <b>Streaming Gateway:</b> WebSocket telemetry manager for live suspect GPS pings.",
                table_cell
            ),
            Paragraph("FastAPI<br/>ASGI Uvicorn<br/>WebSockets<br/>Pydantic v2", table_cell)
        ],
        [
            Paragraph("<b>Tier 3:<br/>Graph Intelligence<br/>& Local Analytics</b>", table_cell),
            Paragraph(
                "&bull; <b>Multi-Factor Scoring:</b> PageRank + Betweenness + Criminal Multiplier formula.<br/>"
                "&bull; <b>12 Forensic Detectors:</b> Hawala cycles, sudden bursts, burner SIM swapping, co-location.<br/>"
                "&bull; <b>Predictive Engine:</b> Local time-series trend forecasting with legal uncertainty disclaimers.<br/>"
                "&bull; <b>Gated Traversal:</b> Surveillance warrant gated BFS/DFS outer shell explorer.",
                table_cell
            ),
            Paragraph("NetworkX<br/>NumPy<br/>SciPy<br/>Evidence Builder", table_cell)
        ],
        [
            Paragraph("<b>Tier 4:<br/>Evidentiary Storage<br/>& Persistence</b>", table_cell),
            Paragraph(
                "&bull; <b>Relational Store:</b> SQLite in WAL mode (Cases, Persons, CDRs, Hawala, FIRs, Waypoints).<br/>"
                "&bull; <b>In-Memory Topology:</b> NetworkX MultiDiGraph for dynamic sub-graph extractions.<br/>"
                "&bull; <b>Audit Vault:</b> Immutable evidentiary chain of custody logging every action.",
                table_cell
            ),
            Paragraph("SQLite 3<br/>SQLAlchemy 2.0<br/>Immutable Log", table_cell)
        ],
    ]

    arch_table = Table(arch_data, colWidths=[80, 324, 100])
    arch_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1A1A1A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.75, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(arch_table)
    story.append(Spacer(1, 10))

    # ── VISUAL EVIDENTIARY PIPELINE WORKFLOW ──
    story.append(Paragraph("3. Visual Evidentiary Pipeline Flow", h1_style))
    story.append(Paragraph(
        "Investigation workflow from raw evidentiary ingestion to tactical surveillance and threat mitigation:",
        body_style
    ))

    flow_data = [
        [
            Paragraph("<b>1. INGESTION</b>", table_cell_bold),
            Paragraph("<b>2. GRAPH SYNTHESIS</b>", table_cell_bold),
            Paragraph("<b>3. ANOMALY DETECTION</b>", table_cell_bold),
            Paragraph("<b>4. WARRANT GATE</b>", table_cell_bold),
            Paragraph("<b>5. TACTICAL ACTION</b>", table_cell_bold),
        ],
        [
            Paragraph("CDRs, Hawala Logs, FIRs, Tower Pings ingested via CSV/JSON (or Seed).", table_cell),
            Paragraph("NetworkX constructs MultiDiGraph; computes PageRank & Suspicion Zones.", table_cell),
            Paragraph("12 forensic detectors identify circular layering, bursts & burner hopping.", table_cell),
            Paragraph("Senior Authority reviews & approves warrants for outer-shell expansion.", table_cell),
            Paragraph("Live radar map tracking & 90-day predictive threat timeline intervention.", table_cell),
        ]
    ]
    flow_table = Table(flow_data, colWidths=[100, 100, 102, 102, 100])
    flow_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor("#334155")),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#F1F5F9")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(flow_table)
    story.append(Spacer(1, 10))

    # ── 4-COLOUR DESIGN PALETTE ──
    story.append(Paragraph("4. Law Enforcement 4-Colour Evidentiary Palette", h1_style))
    story.append(Paragraph(
        "Strictly calibrated for courtroom evidence readability and command center high-contrast standards:",
        body_style
    ))

    palette_data = [
        [
            Paragraph("<b>COLOUR</b>", table_cell_bold),
            Paragraph("<b>HEX CODES</b>", table_cell_bold),
            Paragraph("<b>EVIDENTIARY SEMANTICS & APPLICATION</b>", table_cell_bold),
        ],
        [
            Paragraph("⚪ <b>White</b>", table_cell),
            Paragraph("#FFFFFF<br/>#F8F9FA", code_style),
            Paragraph("Dominant background canvas, neutral node fills, peripheral contacts.", table_cell),
        ],
        [
            Paragraph("🟡 <b>Yellow</b>", table_cell),
            Paragraph("#FFD600<br/>#FFF9C4", code_style),
            Paragraph("Primary investigation accent, Inner Concentric Core Zone (>75% Suspicion), key alerts.", table_cell),
        ],
        [
            Paragraph("🔴 <b>Red</b>", table_cell),
            Paragraph("#E53935<br/>#FFEBEE", code_style),
            Paragraph("High-threat pattern alerts, criminal record badges, registered crime incident & FIR dots.", table_cell),
        ],
        [
            Paragraph("⚫ <b>Black</b>", table_cell),
            Paragraph("#1A1A1A<br/>#333333", code_style),
            Paragraph("Evidentiary typography, high-contrast borders, timeline baseline, command framing.", table_cell),
        ],
    ]
    palette_table = Table(palette_data, colWidths=[90, 94, 320])
    palette_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1A1A1A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.75, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(palette_table)
    story.append(Spacer(1, 10))

    # ── CORE CAPABILITIES ──
    story.append(Paragraph("5. Core Visual Intelligence Capabilities", h1_style))

    story.append(Paragraph("Dual Network Graph Engines (Link Graph ELK & Concentric Rings)", h2_style))
    story.append(Paragraph(
        "&bull; <b>⚡ Link Graph (ELK.js Layout Engine):</b> Hierarchical DAG layered flow with custom SVG CyberNodes and CyberEdges. Nodes dynamically display role badges, photo avatars, criminal history borders, and seed markers. Edges reveal ₹ transaction sums and call counts dynamically on zoom. Features an interactive Minimap with viewport framing.<br/>"
        "&bull; <b>⭕ Concentric Suspicion Rings:</b> Court-compliant concentric zoning: <b>Inner Zone (>75%)</b> for syndicate kingpins; <b>Middle Zone (50–75%)</b> for coordinators; <b>Outer Zone (25–50%)</b> for peripheral couriers; and <b>Pruned (<25%)</b> innocent contacts rendered as discrete '?' placeholders.",
        bullet_style
    ))

    story.append(Paragraph("Dual Evidentiary Timelines (Past Chronology vs Predictive Horizon)", h2_style))
    story.append(Paragraph(
        "&bull; <b>⏱️ Past Timeline (D3.js):</b> Chronological timeline distinguishing white telecommunication pings from red registered FIR/crime incidents. Click any event for metadata and chain of custody.<br/>"
        "&bull; <b>🔮 Predictive Timeline:</b> 12 structured intelligence projections (Hawala settlement cycles, burner SIM rotations, courier handoffs) with interactive D3 time horizon slider (7 to 90 days), risk pill filters, and mandatory statutory evidentiary disclaimers.",
        bullet_style
    ))

    story.append(Paragraph("AI Investigator Assistant", h2_style))
    story.append(Paragraph(
        "&bull; Contextual natural language reasoning assistant querying local graph topology, suspect dossiers, alibis, and CDR logs without external API dependencies. Includes one-click quick investigative queries for hawala flows, bridge nodes, and score override audits.",
        bullet_style
    ))

    story.append(Paragraph("Tactical GeoIntel Map", h2_style))
    story.append(Paragraph(
        "&bull; India-bounded high-contrast dark map with SVG radar sweep animations, simulated live WebSocket GPS tracking, and physical meetup hotspots with concentric orange glow rings and attendee lists.",
        bullet_style
    ))
    story.append(Spacer(1, 8))

    # ── 12 SUSPICIOUS ACTIVITY PATTERN DETECTORS ──
    story.append(Paragraph("6. The 12 Forensic Pattern Detectors", h1_style))

    detectors_data = [
        [Paragraph("<b>#</b>", table_cell_bold), Paragraph("<b>DETECTOR NAME</b>", table_cell_bold), Paragraph("<b>FORENSIC DETECTION LOGIC</b>", table_cell_bold)],
        [Paragraph("1", table_cell), Paragraph("Sudden Communication Burst", table_cell_bold), Paragraph("Call volume exceeding 3x the 30-day baseline prior to a crime incident.", table_cell)],
        [Paragraph("2", table_cell), Paragraph("New Unrelated Connections", table_cell_bold), Paragraph("Sudden direct calls between clusters with zero prior common associates.", table_cell)],
        [Paragraph("3", table_cell), Paragraph("Bridge Node (High Centrality)", table_cell_bold), Paragraph("Single entity connecting two or more mutually disjoint criminal groups.", table_cell)],
        [Paragraph("4", table_cell), Paragraph("Cross-Case Entity Linkage", table_cell_bold), Paragraph("Same phone, vehicle, or bank account appearing across multiple FIRs.", table_cell)],
        [Paragraph("5", table_cell), Paragraph("Unusual Location Sequence", table_cell_bold), Paragraph("Physically impossible transit velocities between distant cell towers.", table_cell)],
        [Paragraph("6", table_cell), Paragraph("Repeated Co-Location", table_cell_bold), Paragraph("Independent phones repeatedly sharing cell towers within 15-minute windows.", table_cell)],
        [Paragraph("7", table_cell), Paragraph("Structured Financial Smurfing", table_cell_bold), Paragraph("Multiple transactions placed just below mandatory reporting thresholds.", table_cell)],
        [Paragraph("8", table_cell), Paragraph("Circular Hawala Layering", table_cell_bold), Paragraph("Cyclic fund flows (A &rarr; B &rarr; C &rarr; A) designed to obscure source of proceeds.", table_cell)],
        [Paragraph("9", table_cell), Paragraph("Call + Location Correlation", table_cell_bold), Paragraph("Short coordination calls immediately preceding co-located physical meetings.", table_cell)],
        [Paragraph("10", table_cell), Paragraph("Burner SIM / Identity Hopping", table_cell_bold), Paragraph("IMEI or SIM discarded sequentially while contacting the exact same core peers.", table_cell)],
        [Paragraph("11", table_cell), Paragraph("Sudden Community Formation", table_cell_bold), Paragraph("New sub-graph cluster emerging with rapid link density in a short window.", table_cell)],
        [Paragraph("12", table_cell), Paragraph("Dormant Network Reactivation", table_cell_bold), Paragraph("Inoperative criminal network showing sudden high-frequency reactivation.", table_cell)],
    ]
    det_table = Table(detectors_data, colWidths=[24, 160, 320])
    det_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1A1A1A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(det_table)
    story.append(Spacer(1, 10))

    # ── QUICK START & DEFAULT CREDENTIALS ──
    story.append(Paragraph("7. Deployment & Default Credentials", h1_style))

    story.append(Paragraph(
        "<b>One-Command Launch (Windows):</b> Double-click <code>run.bat</code> or run <code>cmd /c run.bat</code>.<br/>"
        "<b>One-Command Launch (Linux / macOS):</b> Run <code>chmod +x run.sh && ./run.sh</code>.<br/>"
        "Backend API: <code>http://localhost:8000</code> &bull; Frontend UI: <code>http://localhost:5173</code>",
        body_style
    ))

    cred_data = [
        [Paragraph("<b>ROLE</b>", table_cell_bold), Paragraph("<b>USERNAME</b>", table_cell_bold), Paragraph("<b>PASSWORD</b>", table_cell_bold), Paragraph("<b>AUTHORIZATION LEVEL</b>", table_cell_bold)],
        [Paragraph("<b>Investigator</b>", table_cell), Paragraph("investigator", code_style), Paragraph("invest123", code_style), Paragraph("Case analysis, graph traversal, score override with justification.", table_cell)],
        [Paragraph("<b>Senior Authority</b>", table_cell), Paragraph("senior", code_style), Paragraph("senior123", code_style), Paragraph("Surveillance warrant approvals, standing authorizations, override sign-off.", table_cell)],
        [Paragraph("<b>Administrator</b>", table_cell), Paragraph("admin", code_style), Paragraph("admin123", code_style), Paragraph("Immutable chain of custody audit logs, system administration.", table_cell)],
    ]
    cred_table = Table(cred_data, colWidths=[90, 80, 80, 254])
    cred_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1A1A1A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(cred_table)
    story.append(Spacer(1, 10))

    # ── COURTROOM ADMISSIBILITY & COMPLIANCE ──
    story.append(Paragraph("8. Evidentiary Admissibility (Evidence Act §65B)", h1_style))
    story.append(Paragraph(
        "<b>1. 100% Air-Gapped Operation:</b> Zero telemetry or external cloud dependencies.<br/>"
        "<b>2. Immutable Evidentiary Audit Trail:</b> Every node search, warrant request, and score override is permanently hashed and logged.<br/>"
        "<b>3. Deterministic Graph Math:</b> Rankings are generated by transparent graph algorithms (PageRank, Betweenness) rather than non-reproducible black-box models.<br/>"
        "<b>4. Surveillance Warrant Gating:</b> Peripheral contacts cannot be probed without senior officer sign-off.",
        body_style
    ))

    # Build PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated PDF at: {output_path}")

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "README.pdf")
    build_pdf(out)
