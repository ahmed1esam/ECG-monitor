import tensorflow.compat.v2 as tf
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import bcrypt
import os
import numpy as np
from datetime import datetime, timedelta
from keras.models import load_model
import io
import math
import pywt
import hashlib
import uuid
from models import db, User, Patient, Device

def create_app():
    """
    Flask application factory. Configures app, extensions, and database.
    """
    app = Flask(__name__)
    CORS(app)

    # App configuration
    app.config['SECRET_KEY'] = 'dev-key-123'
    app.config['JWT_SECRET_KEY'] = 'jwt-key-123'
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Initialize extensions
    jwt = JWTManager(app)
    db.init_app(app)

    return app, jwt

# Create app and extensions
app, jwt = create_app()

# Configure data folders
TXT_FOLDER_TST = os.path.join(os.path.dirname(__file__), 'data')
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'modelSlide108kshort(0.96290).keras')

# Load the model
try:
    model = load_model(MODEL_PATH)
    print("Model loaded successfully")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

# Admin password for approving users
ADMIN_MASTER_PASSWORD = "superadmin123"

# User roles and approval status
USER_ROLES = ["admin", "doctor", "nurse"]


# Initialize the database (create tables if not exist)
from models import reset_patient_table
with app.app_context():
    reset_patient_table()  # For production, use db.create_all() instead

ecq_data = []

# In-memory user data storage for ECG uploads (not persistent)
users = {}

def preprocess_signal(signals):
    """Preprocess the signal data for model input."""
    # Convert to numpy array
    signals = np.array(signals)
    
    # Handle NaN values
    signals = np.nan_to_num(signals, nan=0.0)
    
    # Ensure we have exactly 1250 samples
    if len(signals) > 1250:
        signals = signals[:1250]
    elif len(signals) < 1250:
        # Pad with zeros if signal is too short
        signals = np.pad(signals, (0, 1250 - len(signals)))
    
    # Reshape for model input (batch_size, samples)
    signals = signals.reshape(1, -1)
    
    return signals

def make_prediction(signals):
    """Make prediction using the loaded model."""
    if model is None:
        return None, "Model not loaded"
    
    try:
        # Preprocess the signal
        processed_signals = preprocess_signal(signals)
        
        # Make prediction
        prediction = model.predict(processed_signals)
        
        # Get the predicted class
        predicted_class = int(np.argmax(prediction[0]))
        confidence = float(prediction[0][predicted_class])
        
        return {
            'class': predicted_class,
            'confidence': confidence,
            'probabilities': prediction[0].tolist()
        }, None
        
    except Exception as e:
        return None, str(e)

def load_files(record_id):
    """Load signal and annotation files for a given record ID."""
    signal_file_path_1 = os.path.join(TXT_FOLDER_TST, record_id, 'signal1.txt')
    annotation_file_path = os.path.join(TXT_FOLDER_TST, record_id, 'annotations.txt')
    
    signals = []
    
    # Load signal1.txt
    try:
        with open(signal_file_path_1, 'r') as f1:
            for line in f1.readlines():
                try:
                    signals.append(float(line.strip()))
                except ValueError:
                    signals.append(np.nan)  # Handle invalid entries
    except FileNotFoundError:
        return None, None
    
    # Load annotations.txt
    try:
        with open(annotation_file_path, 'r') as f:
            annotations = [line.strip().split() for line in f.readlines()]
    except FileNotFoundError:
        annotations = []
    
    return signals, annotations

def denoise_wavelet2(signal, wavelet_name='db4', level=4, threshold=0.04):
    # Perform wavelet transform
    wavelet_coeffs = pywt.wavedec(signal, wavelet_name, level=level)
    # Threshold the wavelet coefficients
    thresholded_coeffs = [pywt.threshold(cA, value=threshold, mode='soft') for cA in wavelet_coeffs]
    # Reconstruct the signal
    reconstructed_signal = pywt.waverec(thresholded_coeffs, wavelet_name)
    return reconstructed_signal


def wavelet_filter(reconstructed_signal, wavelet='db4', level=8):
    coeffs = pywt.wavedec(reconstructed_signal, wavelet, level=level)
    coeffs[0] = np.zeros_like(coeffs[0])
    filteredSignal1 = pywt.waverec(coeffs, wavelet)
    return filteredSignal1[:len(reconstructed_signal)]

# Add a visualization cache to prevent duplicate processing
visualization_cache = {}
# Set a maximum cache size to prevent memory issues
MAX_CACHE_SIZE = 100

@app.route('/api/ecg/predict', methods=['POST'])
@jwt_required()
def predict_ecg():
    """Make prediction on ECG data."""
    data = request.get_json()
    signals = data.get('signals')
    
    if not signals:
        return jsonify({'error': 'No signal data provided'}), 400
    
    prediction, error = make_prediction(signals)
    if error:
        return jsonify({'error': error}), 500
    
    return jsonify(prediction), 200

@app.route('/api/ecg/load/<record_id>', methods=['GET'])
@jwt_required()
def load_ecg_data(record_id):
    """Load ECG data for a specific record ID."""
    signals, annotations = load_files(record_id)
    
    if signals is None:
        return jsonify({'error': 'Record not found'}), 404
    
    # Make prediction if signals are available
    prediction = None
    if signals:
        prediction, error = make_prediction(signals)
        if error:
            prediction = {'error': error}
    
    # Convert numpy values to Python native types for JSON serialization
    signals = [float(s) if not np.isnan(s) else None for s in signals]
    
    return jsonify({
        'signals': signals,
        'annotations': annotations,
        'prediction': prediction
    }), 200

@app.route('/api/ecg/records', methods=['GET'])
@jwt_required()
def list_records():
    """List all available ECG records."""
    try:
        records = [d for d in os.listdir(TXT_FOLDER_TST) 
                  if os.path.isdir(os.path.join(TXT_FOLDER_TST, d))]
        return jsonify({'records': records}), 200
    except FileNotFoundError:
        return jsonify({'records': []}), 200

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')
    email = data.get('email')
    print(f"Registration attempt - Username: {username}, Role: {role}")
    if not username or not password or not role or not email:
        return jsonify({'error': 'Missing required fields'}), 400
    if role not in USER_ROLES:
        return jsonify({'error': 'Invalid role'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already exists'}), 400
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    user = User(
        username=username,
        password_hash=hashed_password.decode('utf-8'),
        email=email,
        role=role,
        approved=(role == 'admin')
    )
    db.session.add(user)
    db.session.commit()
    print(f"User created - Username: {username}, Role: {role}, Approved: {role == 'admin'}")
    if role == 'admin':
        return jsonify({
            'message': 'Admin account created successfully. Please login with admin credentials.',
            'requiresAdminVerification': True
        }), 201
    else:
        access_token = create_access_token(identity=username)
        return jsonify({
            'message': f'{role.capitalize()} account created successfully. Awaiting admin approval.',
            'token': access_token,
            'approved': False,
            'role': role
        }), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    admin_password = data.get('adminPassword')
    print(f"Login attempt - Username: {username}")
    user = User.query.filter_by(username=username).first()
    if not user:
        print(f"Login failed - Username not found: {username}")
        return jsonify({'error': 'Invalid username or password'}), 401
    stored_password = user.password_hash.encode('utf-8')
    try:
        password_correct = bcrypt.checkpw(password.encode('utf-8'), stored_password)
    except Exception as e:
        print(f"Password check error: {str(e)}")
        password_correct = False
    if password_correct:
        # Admin needs to verify with master password
        if user.role == 'admin' and admin_password != ADMIN_MASTER_PASSWORD:
            print(f"Admin verification required for: {username}")
            return jsonify({
                'requiresAdminVerification': True,
                'message': 'Admin verification required'
            }), 200
        # Check if user is approved
        if not user.approved:
            print(f"User not approved: {username}, Role: {user.role}")
            access_token = create_access_token(identity=username)
            return jsonify({
                'token': access_token,
                'approved': False,
                'role': user.role,
                'message': 'Your account is pending approval from an administrator'
            }), 200
        print(f"Login successful: {username}, Role: {user.role}")
        access_token = create_access_token(identity=username)
        return jsonify({
            'token': access_token,
            'approved': True,
            'role': user.role
        }), 200
    print(f"Login failed - Invalid password for: {username}")
    return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/api/admin/approve-user', methods=['POST'])
@jwt_required()
def approve_user():
    admin_username = get_jwt_identity()
    admin_user = User.query.filter_by(username=admin_username).first()
    if not admin_user or admin_user.role != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json()
    username = data.get('username')
    user = User.query.filter_by(username=username).first()
    if not username or not user:
        return jsonify({'error': 'User not found'}), 404
    user.approved = True
    db.session.commit()
    return jsonify({'message': f'User {username} has been approved'}), 200

@app.route('/api/admin/deny-user', methods=['POST'])
@jwt_required()
def deny_user():
    current_user = get_jwt_identity()
    admin_user = User.query.filter_by(username=current_user).first()
    if not admin_user or admin_user.role != 'admin':
        return jsonify({'error': 'Only administrators can deny users'}), 403
    data = request.get_json()
    username = data.get('username')
    if not username:
        return jsonify({'error': 'No username provided'}), 400
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': f'User {username} has been denied access'}), 200

@app.route('/api/admin/get-pending-users', methods=['GET'])
@jwt_required()
def get_pending_users():
    admin_username = get_jwt_identity()
    admin_user = User.query.filter_by(username=admin_username).first()
    if not admin_user or admin_user.role != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    pending_users = User.query.filter_by(approved=False).all()
    pending_users_list = [
        {'username': u.username, 'role': u.role}
        for u in pending_users if u.username != admin_username
    ]
    print(f"Found {len(pending_users_list)} pending users")
    return jsonify({'pendingUsers': pending_users_list}), 200

@app.route('/api/ecg/upload', methods=['POST'])
@jwt_required()
def upload_ecg():
    username = get_jwt_identity()
    data = request.get_json()
    signals = data.get('data')
    
    if not signals:
        return jsonify({'error': 'No signal data provided'}), 400
    
    if username not in users:
        users[username] = {'ecg_data': []}
    
    # Make prediction on uploaded data
    prediction, error = make_prediction(signals)
    if error:
        prediction = {'error': error}
    
    # Store the data and prediction
    users[username]['ecg_data'].append({
        'timestamp': datetime.utcnow().isoformat(),
        'data': signals,
        'prediction': prediction
    })
    
    return jsonify({
        'message': 'Data uploaded successfully',
        'prediction': prediction
    }), 201



@app.route('/api/ecg/classify', methods=['POST'])
@jwt_required()
def classify_ecg():
    try:
        # Get data from request
        data = request.get_json()
        signals = data.get('data')
        
        if not signals:
            return jsonify({'error': 'No signal data provided'}), 400
        
        # For debugging
        print(f"Received {len(signals)} data points for classification")
        
        # Process each window of the signal
        window_size = 1250
        num_windows = math.ceil(len(signals) / window_size)
        results = []
        
        for i in range(num_windows):
            start_idx = i * window_size
            end_idx = min(start_idx + window_size, len(signals))
            window_data = signals[start_idx:end_idx]
            
            # Make prediction for this window
            prediction, error = make_prediction(window_data)
            
            if error:
                print(f"Warning: Failed to classify window {i+1}: {error}")
                # Continue with other windows instead of failing completely
                results.append({
                    'window': i,
                    'error': f"Failed to classify: {error}"
                })
            else:
                # Add detailed debug logging
                print(f"Window {i+1} classification: Class {prediction['class']} with confidence {prediction['confidence']}")
                results.append({
                    'window': i,
                    'class': prediction['class'],
                    'confidence': prediction['confidence'],
                    'probabilities': prediction['probabilities']
                })
        
        # Print full results for debugging
        print(f"Classification complete. Results: {len(results)} windows classified")
        for i, result in enumerate(results):
            if 'class' in result:
                print(f"  Window {i+1}: Class {result['class']}")
        
        # Return classification results for all windows
        return jsonify({
            'windows': results,
            'class': results[0]['class'] if results and 'class' in results[0] else None,            'totalWindows': num_windows
        }), 200
        
    except Exception as e:
        print(f"Error in classification: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/register-patient', methods=['POST'])
@jwt_required()
def register_patient():
    try:
        current_user = get_jwt_identity()
        user = User.query.filter_by(username=current_user).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.role not in ['doctor', 'nurse', 'admin']:
            return jsonify({'error': 'Unauthorized access'}), 403
        data = request.get_json()
        required_fields = ['first_name', 'last_name', 'dob', 'gender', 'deviceId']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'Missing required field: {field}'}), 400
        # Validate device exists and is active
        device = Device.query.filter_by(device_id=data.get('deviceId')).first()
        if not device or device.status != 'active':
            return jsonify({'error': f"Device {data.get('deviceId')} is not active or not found"}), 400
        # Create patient record
        patient = Patient(
            first_name=data.get('first_name'),
            last_name=data.get('last_name'),
            dob=data.get('dob'),
            gender=data.get('gender'),
            device_id=device.id,
            created_at=datetime.now()
        )
        db.session.add(patient)
        db.session.commit()
        return jsonify({
            'message': f"Patient {patient.first_name} {patient.last_name} registered successfully",
            'patientId': patient.id
        }), 201
    except Exception as e:
        print(f"Error registering patient: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/patients', methods=['GET'])
@jwt_required()
def get_patients():
    try:
        current_user = get_jwt_identity()
        user = User.query.filter_by(username=current_user).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.role not in ['doctor', 'nurse', 'admin']:
            return jsonify({'error': 'Unauthorized access'}), 403
        patients = Patient.query.all()
        patient_list = [
            {
                'id': p.id,
                'first_name': p.first_name,
                'last_name': p.last_name,
                'dob': p.dob,
                'gender': p.gender,
                'deviceId': Device.query.get(p.device_id).device_id if p.device_id else None,
                'createdAt': p.created_at.isoformat() if p.created_at else None
            }
            for p in patients
        ]
        return jsonify({
            'patients': patient_list,
            'total': len(patient_list)
        }), 200
    except Exception as e:
        print(f"Error retrieving patients: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/patients/<int:patient_id>', methods=['DELETE'])
@jwt_required()
def delete_patient(patient_id):
    try:
        current_user = get_jwt_identity()
        user = User.query.filter_by(username=current_user).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.role not in ['doctor', 'nurse', 'admin']:
            return jsonify({'error': 'Unauthorized access'}), 403
        patient = Patient.query.get(patient_id)
        if not patient:
            return jsonify({'error': 'Patient not found'}), 404
        db.session.delete(patient)
        db.session.commit()
        return jsonify({'message': 'Patient deleted successfully'}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint to verify the API is running."""
    model_status = "loaded" if model is not None else "not loaded"
    return jsonify({
        'status': 'ok',
        'model': model_status,
        'timestamp': datetime.now().isoformat()
    }), 200

# Device management endpoints
# Helper functions for user checks
def is_user_approved(current_user):
    user = User.query.filter_by(username=current_user).first()
    return user is not None and user.approved

def has_role(current_user, allowed_roles):
    user = User.query.filter_by(username=current_user).first()
    return user is not None and user.role in allowed_roles

@app.route('/api/devices', methods=['GET'])
@jwt_required()
def get_devices():
    current_user = get_jwt_identity()
    if not is_user_approved(current_user):
        return jsonify({'error': 'Unauthorized access'}), 401
    devices = Device.query.all()
    devices_safe = []
    for device in devices:
        dev = {
            'id': device.id,
            'deviceId': device.device_id,
            'deviceName': device.device_name,
            'deviceType': device.device_type,
            'status': device.status,
            'createdAt': device.created_at.isoformat() if device.created_at else None,
            'createdBy': device.created_by,
            'updatedAt': device.updated_at.isoformat() if device.updated_at else None,
            'updatedBy': device.updated_by,
            'wifiSSID': device.wifi_ssid,
            'wifiPassword': None
        }
        devices_safe.append(dev)
    return jsonify({'devices': devices_safe}), 200


@app.route('/api/devices', methods=['POST'])
@jwt_required()
def add_device():
    current_user = get_jwt_identity()
    if not is_user_approved(current_user):
        return jsonify({'error': 'Unauthorized access'}), 401
    # Only doctors and admins can add devices
    user = User.query.filter_by(username=current_user).first()
    if not user or user.role not in ['doctor', 'admin']:
        return jsonify({'error': 'Only doctors and administrators can manage devices'}), 403
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    # Check for duplicate deviceId
    if Device.query.filter_by(device_id=data['deviceId']).first():
        return jsonify({'error': 'Device ID already exists'}), 400
    new_device = Device(
        device_id=data['deviceId'],
        device_name=data['deviceName'],
        device_type=data['deviceType'],
        status=data['status'],
        created_at=datetime.now(),
        created_by=current_user,
        wifi_ssid=data.get('wifiSSID', ''),
        wifi_password=data.get('wifiPassword', '')
    )
    db.session.add(new_device)
    db.session.commit()
    device_response = {
        'id': new_device.id,
        'deviceId': new_device.device_id,
        'deviceName': new_device.device_name,
        'deviceType': new_device.device_type,
        'status': new_device.status,
        'createdAt': new_device.created_at.isoformat(),
        'createdBy': new_device.created_by,
        'wifiSSID': new_device.wifi_ssid,
        'wifiPassword': None
    }
    return jsonify({'message': 'Device added successfully', 'device': device_response}), 201


@app.route('/api/devices/<int:device_id>', methods=['PUT'])
@jwt_required()
def update_device(device_id):
    current_user = get_jwt_identity()
    if not is_user_approved(current_user):
        return jsonify({'error': 'Unauthorized access'}), 401
    user = User.query.filter_by(username=current_user).first()
    if not user or user.role not in ['doctor', 'admin']:
        return jsonify({'error': 'Only doctors and administrators can manage devices'}), 403
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    device = Device.query.get(device_id)
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    # Check if updating to an existing device ID (that's not this device's current ID)
    if 'deviceId' in data and data['deviceId'] != device.device_id:
        if Device.query.filter_by(device_id=data['deviceId']).first():
            return jsonify({'error': 'Device ID already exists'}), 400
    # Update device fields
    if 'deviceId' in data:
        device.device_id = data['deviceId']
    if 'deviceName' in data:
        device.device_name = data['deviceName']
    if 'deviceType' in data:
        device.device_type = data['deviceType']
    if 'status' in data:
        device.status = data['status']
    if 'wifiSSID' in data:
        device.wifi_ssid = data['wifiSSID']
    if 'wifiPassword' in data:
        device.wifi_password = data['wifiPassword']
    device.updated_at = datetime.now()
    device.updated_by = current_user
    db.session.commit()
    device_response = {
        'id': device.id,
        'deviceId': device.device_id,
        'deviceName': device.device_name,
        'deviceType': device.device_type,
        'status': device.status,
        'createdAt': device.created_at.isoformat() if device.created_at else None,
        'createdBy': device.created_by,
        'updatedAt': device.updated_at.isoformat() if device.updated_at else None,
        'updatedBy': device.updated_by,
        'wifiSSID': device.wifi_ssid,
        'wifiPassword': None
    }
    return jsonify({'message': 'Device updated successfully', 'device': device_response}), 200


@app.route('/api/devices/<int:device_id>', methods=['DELETE'])
@jwt_required()
def delete_device(device_id):
    current_user = get_jwt_identity()
    if not is_user_approved(current_user):
        return jsonify({'error': 'Unauthorized access'}), 401
    user = User.query.filter_by(username=current_user).first()
    if not user or user.role not in ['doctor', 'admin']:
        return jsonify({'error': 'Only doctors and administrators can manage devices'}), 403
    device = Device.query.get(device_id)
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    # Check if device is assigned to any patients
    patient_using_device = Patient.query.filter_by(device_id=device.id).first()
    if patient_using_device:
        return jsonify({'error': 'Cannot delete device that is assigned to patients'}), 400
    db.session.delete(device)
    db.session.commit()
    return jsonify({'message': 'Device deleted successfully', 'device': {'id': device_id}}), 200


if __name__ == '__main__':
    # Create data directory if it doesn't exist
    os.makedirs(TXT_FOLDER_TST, exist_ok=True)
    app.run(debug=True)
