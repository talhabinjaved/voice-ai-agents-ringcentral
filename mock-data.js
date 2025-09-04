// Mock data for different types of queries
const mockData = {
  appointments: [
    {
      patientId: "12345",
      date: "2025-01-15",
      time: "10:30 AM",
      doctor: "Dr. Sarah Johnson",
      location: "Main Clinic, Room 102",
      type: "General Checkup"
    },
    {
      patientId: "12345", 
      date: "2025-02-20",
      time: "2:15 PM",
      doctor: "Dr. Michael Chen",
      location: "Cardiology Center, Room 201",
      type: "Cardiology Follow-up"
    }
  ],
  
  labResults: [
    {
      patientId: "12345",
      testName: "Complete Blood Count",
      date: "2025-01-10",
      status: "Normal",
      notes: "All values within normal range"
    },
    {
      patientId: "12345",
      testName: "Cholesterol Panel", 
      date: "2025-01-08",
      status: "Slightly Elevated",
      notes: "Total cholesterol 210 mg/dL"
    }
  ],
  
  billing: [
    {
      patientId: "12345",
      invoiceNumber: "INV-2025-001",
      amount: "$150.00",
      dueDate: "2025-02-01",
      description: "Office Visit - General Checkup",
      status: "Outstanding"
    },
    {
      patientId: "12345", 
      invoiceNumber: "INV-2025-002",
      amount: "$85.00",
      dueDate: "2025-01-25",
      description: "Lab Work - Blood Tests",
      status: "Paid"
    }
  ],
  
  patients: [
    {
      id: "12345",
      name: "John Smith",
      phone: "6505551234",
      dateOfBirth: "1985-06-15"
    }
  ]
};

// Mock API functions
const mockAPI = {
  getAppointments: function(patientId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const appointments = mockData.appointments.filter(apt => apt.patientId === patientId);
        resolve(appointments);
      }, 500); // Simulate API delay
    });
  },
  
  getLabResults: function(patientId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const results = mockData.labResults.filter(lab => lab.patientId === patientId);
        resolve(results);
      }, 500);
    });
  },
  
  getBilling: function(patientId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const billing = mockData.billing.filter(bill => bill.patientId === patientId);
        resolve(billing);
      }, 500);
    });
  },
  
  getPatientByPhone: function(phoneNumber) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const patient = mockData.patients.find(p => p.phone === phoneNumber);
        resolve(patient);
      }, 300);
    });
  }
};

module.exports = { mockData, mockAPI };
