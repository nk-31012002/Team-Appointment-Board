from datetime import date, time
from typing import List, Optional
from enum import Enum

from fastapi import FastAPI, HTTPException, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, Integer, String, Date, Time, Enum as SqlEnum, and_, or_
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# ----------------- Database Setup -----------------
# Using SQLite locally for zero-config run. 
# For PostgreSQL/MySQL, swap with: "postgresql://user:password@localhost/dbname"
DATABASE_URL = "sqlite:///./appointments.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class StatusEnum(str, Enum):
    SCHEDULED = "Scheduled"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"

class AppointmentModel(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, default="")
    date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    status = Column(SqlEnum(StatusEnum), default=StatusEnum.SCHEDULED, nullable=False)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ----------------- Pydantic Schemas -----------------
class AppointmentBase(BaseModel):
    title: str = Field(..., min_length=1)
    description: Optional[str] = ""
    date: date
    start_time: time
    end_time: time

class AppointmentCreate(AppointmentBase):
    pass

class AppointmentUpdate(AppointmentBase):
    pass

class StatusUpdate(BaseModel):
    status: StatusEnum

class AppointmentResponse(AppointmentBase):
    id: int
    status: StatusEnum

    class Config:
        from_attributes = True

# ----------------- FastAPI App -----------------
app = FastAPI(title="Appointment Board API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Seed Sample Data on Startup
@app.on_event("startup")
def seed_data():
    db = SessionLocal()
    if db.query(AppointmentModel).count() == 0:
        samples = [
            AppointmentModel(
                title="Design Review",
                description="Review UI mockups with the design squad",
                date=date(2026, 9, 12),
                start_time=time(9, 0),
                end_time=time(10, 0),
                status=StatusEnum.SCHEDULED,
            ),
            AppointmentModel(
                title="Sprint Retrospective",
                description="Reflect on previous sprint bottlenecks",
                date=date(2026, 9, 12),
                start_time=time(10, 30),
                end_time=time(11, 30),
                status=StatusEnum.SCHEDULED,
            ),
            AppointmentModel(
                title="Client Demo",
                description="Product feature walkthrough",
                date=date(2026, 9, 12),
                start_time=time(14, 0),
                end_time=time(15, 0),
                status=StatusEnum.COMPLETED,
            ),
            AppointmentModel(
                title="QA Sync",
                description="Triage blocker bugs before release",
                date=date(2026, 9, 13),
                start_time=time(11, 0),
                end_time=time(12, 0),
                status=StatusEnum.CANCELLED,
            ),
        ]
        db.add_all(samples)
        db.commit()
    db.close()

# Overlap Validation Helper
def check_time_collision(db: Session, apt_date: date, start_t: time, end_t: time, exclude_id: Optional[int] = None):
    query = db.query(AppointmentModel).filter(
        AppointmentModel.date == apt_date,
        AppointmentModel.status != StatusEnum.CANCELLED,
        and_(
            AppointmentModel.start_time < end_t,
            AppointmentModel.end_time > start_t
        )
    )
    if exclude_id:
        query = query.filter(AppointmentModel.id != exclude_id)
    return query.first() is not None

# 1. Get Appointments with Optional Filters
@app.get("/api/appointments", response_model=List[AppointmentResponse])
def get_appointments(
    filter_date: Optional[date] = Query(None, alias="date"),
    filter_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db)
):
    query = db.query(AppointmentModel)
    if filter_date:
        query = query.filter(AppointmentModel.date == filter_date)
    if filter_status and filter_status != "All":
        query = query.filter(AppointmentModel.status == filter_status)
    return query.order_by(AppointmentModel.date.asc(), AppointmentModel.start_time.asc()).all()

# 2. Add New Appointment
@app.post("/api/appointments", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
def create_appointment(payload: AppointmentCreate, db: Session = Depends(get_db)):
    if payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="End time must be strictly after start time.")
    
    if check_time_collision(db, payload.date, payload.start_time, payload.end_time):
        raise HTTPException(status_code=409, detail="Time slot conflicts with an existing active appointment.")

    new_apt = AppointmentModel(
        title=payload.title,
        description=payload.description or "",
        date=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status=StatusEnum.SCHEDULED
    )
    db.add(new_apt)
    db.commit()
    db.refresh(new_apt)
    return new_apt

# 3. Edit Appointment
@app.put("/api/appointments/{id}", response_model=AppointmentResponse)
def update_appointment(id: int, payload: AppointmentUpdate, db: Session = Depends(get_db)):
    apt = db.query(AppointmentModel).filter(AppointmentModel.id == id).first()
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    if apt.status != StatusEnum.SCHEDULED:
        raise HTTPException(status_code=400, detail="Only scheduled appointments can be modified.")

    if payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="End time must be strictly after start time.")

    if check_time_collision(db, payload.date, payload.start_time, payload.end_time, exclude_id=id):
        raise HTTPException(status_code=409, detail="Time slot conflicts with an existing active appointment.")

    apt.title = payload.title
    apt.description = payload.description or ""
    apt.date = payload.date
    apt.start_time = payload.start_time
    apt.end_time = payload.end_time

    db.commit()
    db.refresh(apt)
    return apt

# 4. Status Transition (Complete / Cancel)
@app.patch("/api/appointments/{id}/status", response_model=AppointmentResponse)
def change_status(id: int, payload: StatusUpdate, db: Session = Depends(get_db)):
    apt = db.query(AppointmentModel).filter(AppointmentModel.id == id).first()
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    if apt.status != StatusEnum.SCHEDULED:
        raise HTTPException(status_code=400, detail=f"Cannot change status of a {apt.status.value.lower()} appointment.")

    apt.status = payload.status
    db.commit()
    db.refresh(apt)
    return apt