require "capybara/cuprite"
require "axe/cuprite/rspec"

Capybara.default_driver = :rack_test
Capybara.javascript_driver = :cuprite

Capybara.register_driver(:cuprite) do |app|
  Capybara::Cuprite::Driver.new(
    app,
    window_size: [ 1280, 800 ],
    browser_options: { "no-sandbox": nil },
    headless: true
  )
end

RSpec.configure do |config|
  config.before(:each, type: :system) do
    driven_by :cuprite
  end
end
