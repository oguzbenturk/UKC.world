import ExperiencePackagesPage from '../components/ExperiencePackagesPage';

const ExperienceCampsPage = () => (
  <ExperiencePackagesPage
    seoTitle="Camps | Experience | UKC"
    seoDescription="Explore camp experience bundles combining lessons, accommodation and rental, loaded live from the database."
    headline="Camps"
    accentWord="Experience"
    subheadline="The camps page displays only bundle packages configured for camps in the admin panel."
    disciplineKey="camps"
    emptyTitle="Camp bundles are not configured yet"
    emptyDescription="If there is no camps configuration yet, this section remains empty and updates automatically once packages are added."
  />
);

export default ExperienceCampsPage;
