"use client";

import React, { useState } from "react";

export default function Form() {
  const [participants, setParticipants] = useState([{ name: "", email: "" }]);
  const [signingType, setSigningType] = useState("regular");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);

  const handleParticipantChange = (index, field, value) => {
    const updatedParticipants = [...participants];
    updatedParticipants[index][field] = value;
    setParticipants(updatedParticipants);
  };

  const addParticipant = () => {
    setParticipants([...participants, { name: "", email: "" }]);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFile(reader.result); // This will be a base64 string
      };
      reader.readAsDataURL(file);
    } else {
      setMessage("Please select a valid PDF file.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/docusign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participants, signingType, file }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("Envelope created successfully!");
      } else {
        setMessage(data.error || "Failed to create envelope");
      }
    } catch (error) {
      setMessage("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col items-center gap-4 bg-gray-100 p-6 rounded-md shadow-md"
      onSubmit={handleSubmit}
    >
      <h2 className="text-lg font-semibold">Send Agreement for Signature</h2>
      {participants.map((participant, index) => (
        <div key={index} className="flex gap-2">
          <input
            type="text"
            placeholder="Name"
            className="p-2 border border-gray-300 rounded"
            value={participant.name}
            onChange={(e) =>
              handleParticipantChange(index, "name", e.target.value)
            }
            required
          />
          <input
            type="email"
            placeholder="Email"
            className="p-2 border border-gray-300 rounded"
            value={participant.email}
            onChange={(e) =>
              handleParticipantChange(index, "email", e.target.value)
            }
            required
          />
        </div>
      ))}
      <button
        type="button"
        className="p-2 bg-gray-400 text-white rounded"
        onClick={addParticipant}
      >
        Add Participant
      </button>
      <select
        className="p-2 border border-gray-300 rounded"
        value={signingType}
        onChange={(e) => setSigningType(e.target.value)}
      >
        <option value="regular">Regular Signing</option>
        <option value="notary">Notary Signing</option>
      </select>
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        required
        className="p-2 border border-gray-300 rounded"
      />
      <button
        type="submit"
        className={`p-2 bg-blue-600 text-white rounded ${
          loading ? "opacity-50" : ""
        }`}
        disabled={loading}
      >
        {loading ? "Sending..." : "Send"}
      </button>
      {message && <p className="text-sm text-green-600 mt-2">{message}</p>}
    </form>
  );
}
