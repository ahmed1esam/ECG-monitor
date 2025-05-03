"""
Database models for the ECG application.
Defines User, Patient, and Device tables using SQLAlchemy ORM.
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy import inspect, text

# SQLAlchemy database instance
# This should be initialized in your app factory or main app file
# and imported here for use in models.
db = SQLAlchemy()

def reset_patient_table():
    """
    Drops and recreates the 'patient' table for development/testing purposes.
    WARNING: This will delete all patient records!
    """
    from app import app
    with app.app_context():
        inspector = inspect(db.engine)
        if 'patient' in inspector.get_table_names():
            db.session.execute(text('DROP TABLE IF EXISTS patient'))
            db.session.commit()
        db.create_all()

class User(db.Model):
    """
    User account for authentication and authorization.
    Roles: admin, doctor, nurse
    """
    __tablename__ = 'user'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False)
    approved = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<User {self.username}>'

class Patient(db.Model):
    """
    Patient record associated with a device.
    """
    __tablename__ = 'patient'

    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(60), nullable=False)
    last_name = db.Column(db.String(60), nullable=False)
    dob = db.Column(db.String(20))  # Consider using Date for real DOBs
    gender = db.Column(db.String(20))
    device_id = db.Column(db.Integer, db.ForeignKey('device.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship to Device (backref: 'patients')
    device = db.relationship('Device', back_populates='patients')

    def __repr__(self):
        return f'<Patient {self.first_name} {self.last_name}>'

class Device(db.Model):
    """
    Device record (e.g., ECG device) that can be assigned to patients.
    """
    __tablename__ = 'device'

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(80), unique=True, nullable=False, index=True)
    device_name = db.Column(db.String(120), nullable=False)
    device_type = db.Column(db.String(80))
    status = db.Column(db.String(20))
    wifi_ssid = db.Column(db.String(120))
    wifi_password = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(80))
    updated_at = db.Column(db.DateTime)
    updated_by = db.Column(db.String(80))

    # Relationship to Patient
    patients = db.relationship('Patient', back_populates='device', lazy=True)

    def __repr__(self):
        return f'<Device {self.device_name}>'
