import React, { useState } from "react";

import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";

import * as ImagePicker from "expo-image-picker";

import {
  sendScreenshotForAnalysis,
  submitFeedback,
  AnalysisResult,
} from "../services/api";


// ==========================================
// SANGYAN HOME SCREEN
// ==========================================

export default function HomeScreen() {

  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [reportedAnalysis, setReportedAnalysis] = useState<string | null>(null);

  const handleFeedback = async (kind: "wrong_verdict" | "report_scam") => {
    if (!analysisResult?.analysis_id || feedbackBusy) return;
    setFeedbackBusy(true);
    try {
      await submitFeedback(analysisResult.analysis_id, kind, analysisResult.extracted_text || "");
      setReportedAnalysis(analysisResult.analysis_id);
      Alert.alert("Report received", "Your feedback is queued for review.");
    } catch (error) {
      Alert.alert("Feedback failed", error instanceof Error ? error.message : "Please retry.");
    } finally {
      setFeedbackBusy(false);
    }
  };

  // Selected screenshot
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Selected image metadata
  const [imageName, setImageName] = useState("screenshot.jpg");
  const [imageType, setImageType] = useState("image/jpeg");

  // Loading state
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Analysis response
  const [analysisResult, setAnalysisResult] =
    useState<AnalysisResult | null>(null);


  // ==========================================
  // SELECT SCREENSHOT
  // ==========================================

  const selectScreenshot = async () => {

    try {

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
        });

      if (result.canceled) {
        return;
      }

      const selectedImage = result.assets[0];

      // Save image URI
      setImageUri(selectedImage.uri);

      // Save filename
      setImageName(
        selectedImage.fileName || "screenshot.jpg"
      );

      // Save actual MIME type
      setImageType(
        selectedImage.mimeType || "image/jpeg"
      );

      // Clear previous result
      setAnalysisResult(null);

      console.log(
        "Selected screenshot:",
        selectedImage.uri
      );

    } catch (error) {

      console.error(
        "Screenshot selection error:",
        error
      );

      Alert.alert(
        "Error",
        "Unable to select screenshot."
      );

    }

  };


  // ==========================================
  // ANALYZE SCREENSHOT
  // ==========================================

  const handleAnalyzeScreenshot = async () => {

    // Prevent duplicate requests
    if (isAnalyzing) {
      return;
    }

    // Ensure screenshot exists
    if (!imageUri) {

      Alert.alert(
        "No Screenshot",
        "Please select a screenshot first."
      );

      return;
    }

    try {

      // Start loading
      setIsAnalyzing(true);

      // Clear previous result
      setAnalysisResult(null);

      console.log(
        "Starting screenshot analysis..."
      );

      // ======================================
      // CALL FASTAPI BACKEND
      // ======================================

      const result =
        await sendScreenshotForAnalysis(
          imageUri,
          imageName,
          imageType
        );

      // ======================================
      // STORE RESULT
      // ======================================

      setAnalysisResult(result);

      console.log(
        "Analysis completed:",
        result
      );

    } catch (error) {

      console.error(
        "Analysis failed:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.";

      Alert.alert(
        "Analysis Failed",
        `${message}\n\nMake sure the FastAPI server is running and your phone and laptop are connected to the same network.`
      );

    } finally {

      // Stop loading
      setIsAnalyzing(false);

    }

  };


  // ==========================================
  // USER INTERFACE
  // ==========================================

  return (

    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
    >

      {/* ================================== */}
      {/* APP HEADER */}
      {/* ================================== */}

      <Text style={styles.title}>
        SANGYAN
      </Text>

      <Text style={styles.subtitle}>
        Investor Safety Shield
      </Text>

      <Text style={styles.description}>
        Upload a financial screenshot to check
        for potential investor-safety warning signs.
      </Text>


      {/* ================================== */}
      {/* SCREENSHOT PICKER */}
      {/* ================================== */}

      <TouchableOpacity
        style={styles.selectButton}
        onPress={selectScreenshot}
        disabled={isAnalyzing}
        activeOpacity={0.8}
      >

        <Text style={styles.buttonText}>
          Select Screenshot
        </Text>

      </TouchableOpacity>


      {/* ================================== */}
      {/* IMAGE PREVIEW */}
      {/* ================================== */}

      {imageUri && (

        <View style={styles.previewContainer}>

          <Text style={styles.sectionTitle}>
            Selected Screenshot
          </Text>

          <Image
            source={{ uri: imageUri }}
            style={styles.previewImage}
          />

          <Text style={styles.fileName}>
            {imageName}
          </Text>

        </View>

      )}


      {/* ================================== */}
      {/* ANALYZE BUTTON */}
      {/* ================================== */}

      <TouchableOpacity
        style={[
          styles.analyzeButton,
          (!imageUri || isAnalyzing) &&
            styles.disabledButton,
        ]}
        onPress={handleAnalyzeScreenshot}
        disabled={!imageUri || isAnalyzing}
        activeOpacity={0.8}
      >

        {isAnalyzing ? (

          <View style={styles.loadingContainer}>

            <ActivityIndicator
              size="small"
              color="#FFFFFF"
            />

            <Text style={styles.buttonText}>
              Analyzing...
            </Text>

          </View>

        ) : (

          <Text style={styles.buttonText}>
            Analyze Screenshot
          </Text>

        )}

      </TouchableOpacity>


      {/* ================================== */}
      {/* ANALYSIS RESULT */}
      {/* ================================== */}

      {analysisResult && (

        <View style={styles.resultContainer}>

          <Text style={styles.resultHeading}>
            Analysis Result
          </Text>


          {/* RISK LEVEL */}

          <View style={styles.riskCard}>

            <Text style={styles.riskLabel}>
              ATTENTION LEVEL
            </Text>

            <Text style={styles.riskValue}>
              {analysisResult.risk.level.replace(
                /_/g,
                " "
              )}
              
            </Text>

          </View>
          {analysisResult.analysis_id && (
            <View>
              <Text style={styles.explanation}>Submitting feedback shares the extracted text with the review team.</Text>
              {(["wrong_verdict", "report_scam"] as const).map((kind) => (
                <TouchableOpacity key={kind} style={styles.selectButton}
                  accessibilityRole="button"
                  disabled={feedbackBusy || reportedAnalysis === analysisResult.analysis_id}
                  onPress={() => handleFeedback(kind)}>
                  <Text style={styles.buttonText}>{kind === "wrong_verdict" ? "Wrong verdict" : "Report scam"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* OCR EXTRACTED TEXT */}
          <View style={styles.ocrCard}>
            <View style={styles.ocrHeader}>
              <Text style={styles.ocrLabel}>
                EXTRACTED SCREENSHOT TEXT
              </Text>
              <Text style={styles.ocrStatus}>
                OCR COMPLETE
              </Text>
            </View>

            {analysisResult.extracted_text?.trim() ? (
              <Text selectable style={styles.extractedText}>
                {analysisResult.extracted_text}
              </Text>
            ) : (
              <Text style={styles.explanation}>
                No readable text was detected in this screenshot. Try uploading a clearer image.
              </Text>
            )}
          </View>

          {/* EXPLANATION */}
          <Text style={styles.sectionTitle}>
            Explanation
          </Text>

          <Text style={styles.explanation}>
            {analysisResult.explanation}
          </Text>

          {/* DETECTED SIGNALS */}

          <Text style={styles.sectionTitle}>
            Detected Warning Signs
          </Text>

          {analysisResult.signals.map(
            (signal, index) => (

              <View
                key={index}
                style={styles.signalCard}
              >

                <Text style={styles.signalTitle}>
                  {signal.title}
                </Text>

                <Text style={styles.signalDescription}>
                  {signal.description}
                </Text>

                <Text style={styles.severity}>
                  Severity: {signal.severity}
                </Text>

              </View>

            )
          )}


          {/* VERIFICATION GUIDANCE */}

          <Text style={styles.sectionTitle}>
            What You Can Do
          </Text>

          {analysisResult.verification.map(
            (step, index) => (

              <Text
                key={index}
                style={styles.verificationStep}
              >
                {"\u2022"} {step}
              </Text>

            )
          )}

        </View>

      )}


      {/* ================================== */}
      {/* DISCLAIMER */}
      {/* ================================== */}

      <Text style={styles.footerText}>
        SANGYAN provides investor-safety
        information and verification guidance.
        It does not provide buy/sell recommendations.
      </Text>

    </ScrollView>

  );

}


// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({

  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  container: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 65,
    paddingBottom: 50,
  },

  title: {
    fontSize: 38,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: 2,
    marginBottom: 5,
  },

  subtitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 18,
  },

  description: {
    fontSize: 15,
    color: "#666666",
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 30,
  },

  selectButton: {
    width: "100%",
    backgroundColor: "#111111",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },

  analyzeButton: {
    width: "100%",
    backgroundColor: "#D97706",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },

  disabledButton: {
    opacity: 0.5,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  previewContainer: {
    width: "100%",
    alignItems: "center",
    marginTop: 10,
  },

  previewImage: {
    width: 260,
    height: 320,
    resizeMode: "contain",
    borderRadius: 10,
    marginTop: 10,
  },

  fileName: {
    fontSize: 12,
    color: "#777777",
    marginTop: 8,
  },

  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  resultContainer: {
    width: "100%",
    marginTop: 35,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },

  resultHeading: {
    fontSize: 25,
    fontWeight: "800",
    color: "#111111",
    marginBottom: 20,
    textAlign: "center",
  },

  riskCard: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    padding: 22,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 25,
  },

  riskLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#92400E",
    marginBottom: 8,
    letterSpacing: 1,
  },

  riskValue: {
    fontSize: 23,
    fontWeight: "800",
    color: "#92400E",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222222",
    marginBottom: 12,
    marginTop: 12,
    alignSelf: "flex-start",
  },

  explanation: {
    fontSize: 15,
    color: "#444444",
    lineHeight: 23,
    marginBottom: 15,
  },

  signalCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  signalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#222222",
    marginBottom: 8,
  },

  signalDescription: {
    fontSize: 14,
    color: "#555555",
    lineHeight: 21,
  },

  severity: {
    fontSize: 12,
    fontWeight: "600",
    color: "#B45309",
    marginTop: 10,
    textTransform: "uppercase",
  },

  verificationStep: {
    fontSize: 15,
    color: "#444444",
    lineHeight: 24,
    marginBottom: 10,
    alignSelf: "flex-start",
  },

  footerText: {
    fontSize: 12,
    color: "#888888",
    textAlign: "center",
    marginTop: 35,
    lineHeight: 19,
  },
  
  ocrCard: {
    width: "100%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DCE3EA",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },

  ocrHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 14,
  },

  ocrLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 1,
  },

  ocrStatus: {
    fontSize: 10,
    fontWeight: "700",
    color: "#047857",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },

  extractedText: {
    fontSize: 14,
    color: "#1F2937",
    lineHeight: 23,
    textAlign: "left",
  },

  copyButton: {
    marginTop: 16,
    backgroundColor: "#111827",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 9,
    alignItems: "center",
  },

  copyButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

});