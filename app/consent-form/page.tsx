export default function ConsentFormPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-6 text-center">
            Detailed Consent Form
          </h1>
          
          <div className="prose max-w-none">
            <div className="space-y-6">
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Project Title</h2>
                <p className="text-lg text-gray-700 leading-relaxed font-medium">
                  Understanding individual and group dynamics in AI-supported collaborative learning
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Research Overview</h2>
                <p className="text-lg text-gray-700 leading-relaxed">
                  You are invited to participate in this research project led by Dr Shihui Feng, an Assistant Professor, 
                  from the Faculty of Education at the University of Hong Kong. This project aims to uncovering individual 
                  and collaborative learning dynamics in AI-supported learning environment, as well as to explore the 
                  perceptions and effectiveness of the use of AI tools in individual and collaborative learning. If you 
                  are from the class taught by the PI, you are ensured that your participation in the research project 
                  has no impact on your grade in the course.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Research Activities</h2>
                <p className="text-lg text-gray-700 leading-relaxed">
                  As part of this project, each participant will be invited to participate in multiple collaborative 
                  learning activities using an AI-supported collaborative learning tool. Control and experimental 
                  groups can be implemented in the activities by regulating access to the AI-supported tool or 
                  specific functions within the tool. It's important to note that every participant will have an 
                  equal opportunity to utilize the AI tool. This will be achieved by switching participants between 
                  the control and experimental groups during different activities.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data Collection</h2>
                <p className="text-lg text-gray-700 leading-relaxed">
                  Artefacts produced in the group project will be collected, including the log and process data 
                  recorded in the tool, the individual and group deliverables, and the group assignment grades. 
                  In addition, participants will be invited to fill out an online questionnaire which will take 
                  about 10 mins to complete, regarding their perceptions of collaborative learning experiences 
                  after each collaboration.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data Usage and Protection</h2>
                <p className="text-lg text-gray-700 leading-relaxed mb-3">
                  The collected data will only be used for research purposes and can only be accessed by the project team. 
                  All collected digital data will be kept confidential in a password-protected hard drive of the primary 
                  investigator. Any physical data will be stored in a locked cabinet in the primary investigator's office 
                  at the University of Hong Kong. Personal identifiers of participants will only be used to link the data 
                  collected in different procedures. All personal identifier information will be removed from the data 
                  before the data analysis. No personal identifier information will be revealed in the research process 
                  and publications from the project.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Your Rights</h2>
                <p className="text-lg text-gray-700 leading-relaxed">
                  You have the right to request access to your data and withdraw your data from the study at any time 
                  without any consequences. The original research data with personal identifiers will be kept for three 
                  years after the first publication of the research. Strictly anonymized data will be available to other 
                  researchers in the field for reference twelve months after the publication of research results or the 
                  completion of the project.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Contact Information</h2>
                <p className="text-lg text-gray-700 leading-relaxed">
                  If you have any questions regarding this research, please feel free to contact the primary investigator 
                  Dr Shihui Feng (<a href="mailto:shihuife@hku.hk" className="text-blue-600 hover:text-blue-800 underline">shihuife@hku.hk</a>, 
                  phone: 2219 4310).
                </p>
                <p className="text-lg text-gray-700 leading-relaxed mt-3">
                  If you would like to know more about the rights as a research participant, please contact the Human Research Ethics Committee, 
                  the University of Hong Kong (2241-5267). Your consent is very much appreciated.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed mt-3 font-medium">
                  HREC Reference Number: [EA240047]
                </p>
              </section>

              <section className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h2 className="text-2xl font-semibold text-blue-900 mb-4">Consent Statement</h2>
                <p className="text-lg text-blue-800 leading-relaxed">
                  By clicking "I understand and proceed" in the consent dialog, you acknowledge that 
                  you have read and understood this consent form, and you agree to participate in 
                  this research study with the understanding that you can withdraw at any time.
                </p>
              </section>
            </div>
          </div>

          <div className="mt-8 text-center">
            <a 
              href="javascript:window.close()" 
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              Close Window
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
