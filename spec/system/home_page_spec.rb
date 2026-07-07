require "rails_helper"

RSpec.describe "Home page", type: :system do
  it "renders the home page and passes axe accessibility audit" do
    visit root_path
    expect(page).to have_text("YouTube Party")
    expect(page).to be_axe_clean
  end
end
