-- CreateTable
CREATE TABLE "ConsultationRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'collecting',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerBirthDate" TEXT,
    "customerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "birthDateConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "recentMedicalHistory" TEXT,
    "currentMedicationStatus" TEXT,
    "currentInsuranceSummary" TEXT,
    "monthlyPremium" TEXT,
    "interestAreas" TEXT[],
    "visitRegion" TEXT,
    "visitAddress" TEXT,
    "visitAddressType" TEXT,
    "preferredVisitYear" INTEGER,
    "preferredVisitMonth" INTEGER,
    "preferredVisitDay" INTEGER,
    "preferredVisitTime" TEXT,
    "preferredVisitTimePeriod" TEXT,
    "notes" TEXT,
    "extractedSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationRecord_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN "recordId" TEXT;

-- AddForeignKey
ALTER TABLE "ConsultationRecord" ADD CONSTRAINT "ConsultationRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ConsultationRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
